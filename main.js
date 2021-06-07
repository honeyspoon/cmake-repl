#! /usr/bin/env node

const fs = require("fs");
const readline = require("readline");
const util = require("util");
const { spawn } = require("child_process");

const tmpfiles = [];
const tmpfile = (callback) => {
  const tmpath = "/tmp/.xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx.cmake".replace(
    /[xy]/g,
    (c) => {
      const r = (Math.random() * 16) | 0,
        v = c == "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    }
  );
  tmpfiles.push(tmpath);
  fs.open(tmpath, "w", 0666, (err, fd) => {
    callback(err, fd, tmpath);
  });
};

process.on("exit", () => {
  tmpfiles.forEach((file) => {
    fs.unlinkSync(file);
  });
});

const stdin = process.openStdin();
const prompt = "cmake $ ";
const cmake_bin_path = "cmake"; // replace with your cmake path

const rli = readline.createInterface(process.stdin, process.stdout);

rli.setPrompt(prompt);
rli.prompt();

stdin.on("data", (chunk) => {
  rli.write(chunk);
});

rli.on("line", (cmd) => {
  if (!cmd) {
    rli.prompt();

    return;
  }

  if (cmd.indexOf(".") == 0) {
    return replCommand(cmd);
  }

  cmd = trimWhitespace(cmd);
  // cmd = regexpEscape(cmd)
  cmd = cmd.replace("&", "_CMAKE_repl_OUT__");

  tmpfile((err, fd, tmpath) => {
    const cmake_code =
      cmd +
      "\n" +
      "foreach(i ${_CMAKE_repl_OUT__})\n" +
      "  message(STATUS ${i})\n" +
      "endforeach()\n";

    if (err) {
      console.log("error while creating temp file", err);

      throw err;
    }

    const buf = new Buffer.from(cmake_code);
    fs.write(fd, buf, 0, buf.length, null, (err, written) => {
      if (err) {
        throw err;
      }

      if (written < buf.length) {
        throw new Error("write was not atomic, too lazy to implemente");
      }

      fs.close(fd, () => {
        const cmake = spawn(cmake_bin_path, ["-P", tmpath]);

        const out_data = "";
        cmake.stdout.on("data", (data) => {
          out_data += data;
        });

        cmake.stderr.on("data", (data) => {
          console.log(data.toString().trim());
        });

        cmake.on("exit", (_) => {
          console.log(out_data.toString().trim());
          rli.prompt();
        });

        cmake.on("error", (e) => {
          console.log("error", e);
          console.log(e);
          rli.prompt();
        });
      });
    });
  });
});

rli.on("close", (_) => {
  stdin.destroy();
});

function trimWhitespace(cmd) {
  const trimmer = /^\s*(.+)\s*$/m,
    matches = trimmer.exec(cmd);

  if (matches && matches.length === 2) {
    return matches[1];
  }
}

function regexpEscape(s) {
  return s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

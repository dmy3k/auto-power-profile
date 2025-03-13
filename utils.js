import Gio from "gi://Gio";
import GLib from "gi://GLib";

export async function getShellVersion() {
  const regex = new RegExp("([0-9]).");
  const [, argv] = GLib.shell_parse_argv("gnome-shell --version");
  const [status, stdout, stderr] = await execCommand(argv);

  return parseInt(regex.exec(stdout)[0]);
}

export function execCommand(argv, input = null, cancellable = null) {
  let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;

  if (input !== null) flags |= Gio.SubprocessFlags.STDIN_PIPE;

  let proc = new Gio.Subprocess({
    argv: argv,
    flags: flags,
  });
  proc.init(cancellable);
  return new Promise((resolve, reject) => {
    proc.communicate_utf8_async(input, cancellable, (proc, res) => {
      try {
        resolve(
          [
            (function () {
              if (!proc.get_if_exited())
                throw new Error("Subprocess failed to exit in time!");
              return proc.get_exit_status();
            })(),
          ].concat(proc.communicate_utf8_finish(res).slice(1))
        );
      } catch (e) {
        reject(e);
      }
    });
  });
}

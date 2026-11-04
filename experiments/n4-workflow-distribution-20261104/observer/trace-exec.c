#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ptrace.h>
#include <sys/wait.h>
#include <unistd.h>

static void log_cmdline(const char *file, pid_t pid) {
  char path[64];
  char buf[8192];
  snprintf(path, sizeof path, "/proc/%d/cmdline", (int)pid);
  int fd = open(path, O_RDONLY);
  if (fd < 0) return;
  ssize_t n = read(fd, buf, sizeof buf - 1);
  close(fd);
  if (n <= 0) return;
  int out = open(file, O_WRONLY | O_CREAT | O_APPEND, 0644);
  if (out < 0) return;
  for (ssize_t i = 0; i < n; i++) {
    if (buf[i] == '\0') buf[i] = '\t';
  }
  if (buf[n - 1] == '\t') n -= 1;
  buf[n] = '\n';
  if (write(out, buf, (size_t)n + 1) < 0) {
    close(out);
    return;
  }
  close(out);
}

static int event_of(int status) {
  if (!WIFSTOPPED(status) || WSTOPSIG(status) != SIGTRAP) return 0;
  return status >> 16;
}

int main(int argc, char **argv) {
  if (argc < 4 || strcmp(argv[2], "--") != 0) {
    fprintf(stderr, "usage: trace-exec LOG -- CMD ARG...\n");
    return 2;
  }
  const char *log = argv[1];
  pid_t root = fork();
  if (root < 0) return 1;
  if (root == 0) {
    if (ptrace(PTRACE_TRACEME, 0, 0, 0) < 0) _exit(127);
    raise(SIGSTOP);
    execvp(argv[3], argv + 3);
    _exit(127);
  }

  int status = 0;
  if (waitpid(root, &status, 0) < 0) return 1;
  long options = PTRACE_O_TRACEEXEC | PTRACE_O_TRACECLONE | PTRACE_O_TRACEFORK
      | PTRACE_O_TRACEVFORK | PTRACE_O_EXITKILL;
  if (ptrace(PTRACE_SETOPTIONS, root, 0, options) < 0) return 1;
  if (ptrace(PTRACE_CONT, root, 0, 0) < 0) return 1;

  int root_code = 1;
  for (;;) {
    pid_t pid = waitpid(-1, &status, __WALL);
    if (pid < 0) {
      if (errno == EINTR) continue;
      break;
    }
    if (WIFEXITED(status) || WIFSIGNALED(status)) {
      if (pid == root) {
        root_code = WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
      }
      continue;
    }
    int event = event_of(status);
    if (event == PTRACE_EVENT_EXEC) log_cmdline(log, pid);
    int delivered = 0;
    if (WIFSTOPPED(status) && event == 0 && WSTOPSIG(status) != SIGTRAP && WSTOPSIG(status) != SIGSTOP) {
      delivered = WSTOPSIG(status);
    }
    if (ptrace(PTRACE_CONT, pid, 0, (void *)(long)delivered) < 0 && errno != ESRCH) {
      return 1;
    }
  }
  return root_code;
}

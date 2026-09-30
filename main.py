import subprocess
import socket
import sys
import threading
import os
import signal
import webbrowser
import time


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def print_output(process, prefix):
    for line in iter(process.stdout.readline, b""):
        print(f"[{prefix}] {line.decode('utf-8', errors='replace')}", end="", flush=True)


def check_npm_deps(base_dir):
    """node_modules yoksa npm install Ã§alÄ±ÅŸtÄ±r"""
    node_modules = os.path.join(base_dir, "node_modules")
    if not os.path.isdir(node_modules):
        print("[SYSTEM] node_modules bulunamadÄ±, baÄŸÄ±mlÄ±lÄ±klar yÃ¼kleniyor...")
        result = subprocess.run(
            "npm install",
            cwd=base_dir,
            shell=True,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"[HATA] npm install baÅŸarÄ±sÄ±z:\n{result.stderr}")
            sys.exit(1)
        print("[SYSTEM] BaÄŸÄ±mlÄ±lÄ±klar yÃ¼klendi!")


def main():
    local_ip = get_local_ip()
    base_dir = os.path.dirname(os.path.abspath(__file__))

    print()
    print("â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—")
    print("â•‘           ğŸŒµ CactusFarm Bot - BaÅŸlatÄ±lÄ±yor           â•‘")
    print("â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£")
    print(f"â•‘  Yerel IP (LAN):    {local_ip:<34}â•‘")
    print(f"â•‘  Dashboard (Local): http://localhost:3001             â•‘")
    print(f"â•‘  Dashboard (LAN):   http://{local_ip}:3001{' ' * (21 - len(local_ip))}â•‘")
    print("â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£")
    print("â•‘  Durdurmak iÃ§in: Ctrl+C                              â•‘")
    print("â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•")
    print()

    check_npm_deps(base_dir)

    server_process = subprocess.Popen(
        "node server.js",
        cwd=base_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        shell=True,
    )

    output_thread = threading.Thread(
        target=print_output, args=(server_process, "SERVER")
    )
    output_thread.daemon = True
    output_thread.start()

    time.sleep(2)
    webbrowser.open("http://localhost:3001")

    def signal_handler(sig, frame):
        print("\n[SYSTEM] Sunucu kapatÄ±lÄ±yor...")
        if os.name == "nt":
            subprocess.call(
                ["taskkill", "/F", "/T", "/PID", str(server_process.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            server_process.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)

    try:
        server_process.wait()
    except KeyboardInterrupt:
        signal_handler(signal.SIGINT, None)


if __name__ == "__main__":
    main()

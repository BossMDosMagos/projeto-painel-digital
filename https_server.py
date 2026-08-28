import http.server
import ssl
import socketserver
import sys

PORT = 8443
DIRECTORY = "."

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {format % args}", file=sys.stderr)

# Create SSL context
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile="localhost.pem", keyfile="localhost-key.pem")

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    print(f"HTTPS Server running at https://0.0.0.0:{PORT}/", file=sys.stderr)
    print(f"Access from phone: https://192.168.1.105:{PORT}/", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...", file=sys.stderr)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        raise
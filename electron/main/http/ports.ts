import net from "node:net";

export async function findAvailablePort(
	preferredPort: number,
	maxAttempts: number,
	host = "127.0.0.1",
) {
	for (let i = 0; i < maxAttempts; i += 1) {
		const port = preferredPort + i;
		const ok = await canListen({ host, port });
		if (ok) return port;
	}
	throw new Error(
		`No available port in range: ${preferredPort}-${preferredPort + maxAttempts - 1}`,
	);
}

async function canListen({ host, port }: { host: string; port: number }) {
	return new Promise<boolean>((resolve) => {
		const server = net.createServer();

		const cleanup = () => {
			server.removeAllListeners();
		};

		server.once("error", () => {
			cleanup();
			resolve(false);
		});

		server.once("listening", () => {
			server.close(() => {
				cleanup();
				resolve(true);
			});
		});

		server.listen(port, host);
	});
}

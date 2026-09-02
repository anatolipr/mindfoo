// Auto-connects mindfoo to a locally-running js-bridge-mcp server, so an MCP
// client can discover/call window.__mcpTools (set up by mcpbridge.ts)
// without a human pasting the embed snippet into DevTools.
//
// Thin per-app wrapper around js-bridge-mcp's own shared connect module
// (packages/js-bridge-mcp/src/client/connect.js, served as connect.js) -
// the actual probe/connect/rename/leave-old-channel lifecycle used to be
// copy-pasted here (and in bulletino-1/htmlpaint's own mcp-connect files);
// now it lives in one place so the three don't drift.
//
// connect.js lives on js-bridge-mcp's own origin (no production deployment,
// separate server) so it can only be reached via dynamic import() - and
// this project's build target doesn't support top-level await, so the
// module starts wired to synchronous Signals in a 'disconnected' stub state
// and swaps to the real createMcpConnect() instance's own state once the
// dynamic import resolves. mind-foo-app.ts only ever reads these Signals
// reactively, so it doesn't need to know a swap happened.
//
// Connection identity is a named CHANNEL, not a session-minted tenant UUID:
// js-bridge-mcp's channel support (mcp-tenant-lib 0.3.3+) makes a channel
// name the same string-keyed tenant id its main.js accepts via the `tenant`
// query param - so mindfoo can connect with a fixed, human-readable name
// (default "mindfoo") with zero interaction, and any MCP client can attach
// to the exact same live connection via join_channel("mindfoo").

import { Signal } from 'avosignals';

const JSBRIDGE_HOST = 'http://localhost:8766';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

// SignalWatcher-backed, same as $theme (data/theme.ts) - lets mind-foo-app.ts
// render the connect button's label reactively instead of needing its own
// listener wiring.
export const $mcpConnectionState: Signal<ConnectionState> = new Signal('disconnected');
export const $mcpChannel: Signal<string> = new Signal('mindfoo');

type ConnectApi = {
	init(): Promise<void>;
	handleConnectClick(): Promise<void>;
	onConnectionStateChange(cb: (state: ConnectionState, channel: string, appLabel: string) => void): () => void;
	getConnectionState(): { state: ConnectionState; channel: string; appLabel: string };
};

let real: ConnectApi | undefined;

const ready: Promise<ConnectApi | undefined> = import(/* @vite-ignore */ `${JSBRIDGE_HOST}/connect.js`)
	.then((mod: { createMcpConnect(opts: { appName: string; onStateChange?: (s: ConnectionState, c: string, l: string) => void }): ConnectApi }) => {
		real = mod.createMcpConnect({
			appName: 'mindfoo',
			onStateChange: (state, channel) => {
				$mcpConnectionState.set(state);
				$mcpChannel.set(channel);
			},
		});
		const initial = real.getConnectionState();
		$mcpConnectionState.set(initial.state);
		$mcpChannel.set(initial.channel);
		return real;
	})
	.catch(() => undefined); // js-bridge-mcp unreachable - stays in the disconnected stub state

// Click behavior: connect (or reconnect) if not connected; if already
// connected, prompt to rename (accepts "channel" or "channel:app-name").
export async function handleConnectClick(): Promise<void> {
	const api = real ?? (await ready);
	await api?.handleConnectClick();
}

// Connects automatically on page load - no button click required. The
// Connect button (wired in mind-foo-app.ts) is only for reconnecting after a
// failed probe or renaming the channel.
export async function initMcpConnect(): Promise<void> {
	const api = await ready;
	await api?.init();
}

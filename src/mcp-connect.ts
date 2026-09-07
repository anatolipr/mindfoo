// Auto-connects mindfoo to a locally-running js-bridge-mcp server, so an MCP
// client can discover/call window.__mcpTools (set up by mcpbridge.ts)
// without a human pasting the embed snippet into DevTools.
//
// Thin per-app wrapper around js-bridge-mcp's own published SDK
// (js-bridge-mcp/client, resolved from node_modules like any other
// dependency) - the actual probe/connect/rename/leave-old-channel
// lifecycle, plus automatic tool-bus loading, lives there so this project
// doesn't hand-roll it.
//
// Unlike the old connect.js dynamic-URL-import this replaces, js-bridge-mcp/
// client is a normal bundled npm import - it resolves at build time
// regardless of whether the js-bridge-mcp *server* happens to be running,
// so no top-level-await/stub-swap dance is needed here anymore:
// connectMcpBridge() returns its API object synchronously (mirroring
// createMcpConnect's own shape), same as this module exposed before, just
// without the intermediate Promise-of-a-stub. connectMcpBridge's internal
// tool-bus load and this module's own init()/handleConnectClick() calls
// still probe reachability and no-op gracefully if js-bridge-mcp isn't
// running - that degrade-gracefully behavior is unchanged, just now lives
// inside the SDK instead of this file's own .catch().
//
// Connection identity is a named CHANNEL, not a session-minted tenant UUID:
// js-bridge-mcp's channel support (mcp-tenant-lib 0.3.3+) makes a channel
// name the same string-keyed tenant id its main.js accepts via the `tenant`
// query param - so mindfoo can connect with a fixed, human-readable name
// (default "mindfoo") with zero interaction, and any MCP client can attach
// to the exact same live connection via join_channel("mindfoo").

import { Signal } from 'avosignals';
import { connectMcpBridge } from 'js-bridge-mcp/client';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

// SignalWatcher-backed, same as $theme (data/theme.ts) - lets mind-foo-app.ts
// render the connect button's label reactively instead of needing its own
// listener wiring.
export const $mcpConnectionState: Signal<ConnectionState> = new Signal('disconnected');
export const $mcpChannel: Signal<string> = new Signal('mindfoo');
// Only meaningfully different from $mcpChannel when a "channel:app-name"
// join was used to share a channel with other apps - mind-foo-app.ts
// appends it to the displayed label in that case only.
export const $mcpAppLabel: Signal<string> = new Signal('mindfoo');

const connect = connectMcpBridge({
	appName: 'mindfoo',
	onStateChange: (state, channel, appLabel) => {
		$mcpConnectionState.set(state as ConnectionState);
		$mcpChannel.set(channel);
		$mcpAppLabel.set(appLabel);
	},
});

const initial = connect.getConnectionState();
$mcpConnectionState.set(initial.state as ConnectionState);
$mcpChannel.set(initial.channel);
$mcpAppLabel.set(initial.appLabel);

// Click behavior: connect (or reconnect) if not connected; if already
// connected, prompt to rename (accepts "channel" or "channel:app-name").
export async function handleConnectClick(): Promise<void> {
	await connect.handleConnectClick();
}

// Connects automatically on page load - no button click required. The
// Connect button (wired in mind-foo-app.ts) is only for reconnecting after a
// failed probe or renaming the channel.
export async function initMcpConnect(): Promise<void> {
	await connect.init();
}

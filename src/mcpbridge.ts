// MCP bridge for mindfoo (aka "arrows"), following the same window.__mcpTools /
// window.__mcpSummary contract as js-bridge-mcp
// (see /Users/anatoli/Downloads/mcp-form-demo/packages/js-bridge-mcp) and the
// htmlpaint.com bridge this file is modeled after
// (/Users/anatoli/workspace2/htmlpaint.com/src/mcpbridge.js).
//
// Unlike those two examples, this file is imported directly from main.ts
// rather than pasted into DevTools - window.__mcpTools/__mcpSummary are
// always defined as soon as the app boots. An external js-bridge-mcp-style
// server still has to inject its own embed-snippet connector script
// (imported dynamically, e.g. via get_embed_snippet) for a real MCP client
// to actually discover and call these; this file only sets up the page side
// of the contract.
import {
	$nodes as nodes,
	$links as links,
	$selection as selection,
	$selectedLink as selectedLink,
	$scene as scene,
	rotateArrows,
	rotateLineDash,
	rotateLineWidth,
	rotateNodeType,
	rotateNodeSize,
	equalSpacing,
	mirror,
	alignLast,
	center,
	colorChange,
	makeNodesMap,
	makeLines,
} from './data/store';
import { $theme as theme, toggleTheme } from './data/theme';
import type { Link, Node, NodeId } from './data/types';
import { UNSELECTED, DEFAULT_NODE_FONT_SIZE, DEFAULT_NODE_TYPE, DEFAULT_WIDTH, DEFAULT_DASH } from './data/types';
import { nanoid } from 'nanoid';

// Manifest-level context surfaced once via the `describe_tools` tool a
// js-bridge-mcp-style server registers automatically for every tenant - not
// repeated into each individual tool description below.
const MOCK_WORKFLOW_NOTE =
	'Context: mindfoo (aka "arrows") is a freeform visual mind-mapping / diagramming tool. A diagram ' +
	'is "nodes" (shapes: roundrect/rect/circle/ellipse/rhombus/parallelogram, holding text/color/font ' +
	'size, positioned by an x/y CENTER point, not top-left) PLUS "links" (curved connector lines ' +
	'between two node ids, each independently stylable as a plain line or an arrow). Reading/writing ' +
	'the whole tree is exactly two tools: get_document and set_document - there is no per-node/per-' +
	'link add/update/delete and no separate node-only or link-only read/write. Plan the whole diagram ' +
	'(or the whole delta) yourself, then call get_document once for current state and set_document ' +
	'once with the complete {nodes, links} you want to exist afterward - never call set_document once ' +
	'per node/link. ' +
	'GOTCHAS: (1) node "x"/"y" are the CENTER, not top-left, and "width"/"height" are recomputed from ' +
	'live DOM measurement on render, so values you write are only a temporary hint - use "minWidth"/' +
	'"minHeight" to force a floor instead of fighting that. (2) links reference nodes by "id" (never ' +
	'array index, which is incidental) - a link whose "one"/"two" does not match a node "id" in the ' +
	'same set_document call is silently unrenderable, so always include both endpoint nodes and the ' +
	'link together. (3) a link with no explicit "direction" defaults to "none" (a plain unarrowed ' +
	'line) and no explicit "color" defaults to the theme color, not to either endpoint node\'s color - ' +
	'do not assume a new link auto-picks up interesting styling. ' +
	'PERSISTENCE: there is no server-side persistence - the document lives only in memory until a ' +
	'human explicitly exports it to a .arrows file; get_document/set_document mirror that same ' +
	'{nodes, links} shape. ' +
	'If you have not already called describe_tools on this connection, call it first for this same ' +
	'context plus the exact node/link JSON shapes referenced below as "above".';

/** @type {any} */ (window as any).__mcpSummary =
	MOCK_WORKFLOW_NOTE +
	' EXACT NODE SHAPE: {"id": string|number, unique, referenced by links - keep an existing node\'s ' +
	'id unchanged, "x"/"y": numbers, CENTER in canvas coordinates (canvas panning is a separate scene ' +
	'offset, see get_scene/set_scene), "width"/"height": numbers in px, auto-recomputed on render, ' +
	'"minWidth"/"minHeight": numbers, 0 = no minimum, "color": CSS color string or "" for theme ' +
	'default, "text": inner HTML shown in the node (plain text is always safe), "size": one of ' +
	'"15px"|"20px"|"25px"|"30px", "type": 0=roundrect, 1=rect, 2=circle, 3=ellipse, 4=rhombus, ' +
	'5=parallelogram - use rotate_node_type on a selection to cycle these rather than hand-guessing ' +
	'the int. EXACT LINK SHAPE: {"one": NodeId, "two": NodeId - the connected nodes\' ids, order does ' +
	'not imply direction, "direction": "none"|"left"|"right"|"both" - which end(s) get an arrowhead; ' +
	'"left"/"right" mean whichever node currently renders further left/right on screen, NOT "one" vs ' +
	'"two", so the arrow can visually flip if a node\'s x later moves it past the other node - prefer ' +
	'"both"/"none" if a stable "points at node X" meaning matters more than screen side, "dash": ""|' +
	'"4" (solid/dashed), "width": 2|4|6 (stroke px), "color": CSS color or undefined for theme ' +
	'default, "text": optional label following the curve. Nodes/links are flat top-level arrays, not ' +
	'nested - connectivity is expressed purely by node x/y plus link one/two, there is no parent/ ' +
	'child scene graph.';

function readDocument(): string {
	return JSON.stringify({ nodes: nodes.get(), links: links.get() });
}

function readSelection(): string {
	let sel = selection.get();
	let selLink = selectedLink.get();
	let allNodes = nodes.get();
	let allLinks = links.get();
	return JSON.stringify({
		selectedNodes: sel.map((i) => allNodes[i]).filter(Boolean),
		selectedNodeIndices: sel,
		selectedLink: selLink !== UNSELECTED ? allLinks[selLink] : null,
	});
}

function findNodeIndex(allNodes: Node[], id: NodeId): number {
	return allNodes.findIndex((n) => n.id === id);
}

function findLinkIndex(allLinks: Link[], one: NodeId, two: NodeId): number {
	return allLinks.findIndex(
		(l) => (l.one === one && l.two === two) || (l.one === two && l.two === one)
	);
}

function writeSelection({ nodeIds }: { nodeIds: string }): string {
	let ids: NodeId[] = JSON.parse(nodeIds);
	if (!Array.isArray(ids)) throw new Error('nodeIds must be a JSON array of node id strings');
	let allNodes = nodes.get();
	let indices = ids
		.map((id) => findNodeIndex(allNodes, id))
		.filter((i) => i > -1);
	selection.set(indices);
	selectedLink.set(UNSELECTED);
	return `selected ${indices.length} of ${ids.length} requested node id(s)`;
}

function getScene(): string {
	return JSON.stringify(scene.get());
}

function setScene({ x, y }: { x: number; y: number }): string {
	scene.set({ x, y });
	return `scene panned to (${x}, ${y})`;
}

function getTheme(): string {
	return theme.get();
}

function setTheme({ theme: t }: { theme: string }): string {
	if (t !== 'dark' && t !== 'light') throw new Error('theme must be "dark" or "light"');
	if (theme.get() !== t) toggleTheme();
	return `theme set to ${t}`;
}

// Fills in fields an agent commonly omits when hand-authoring a node object,
// matching the defaults the UI itself uses when a human creates a node (see
// add() in data/store.ts) - an agent-authored node array skips that
// function entirely (no DOM measurement pass), so this is the only place
// those defaults get applied for bridge-authored nodes.
function fillNodeDefaults(n: Partial<Node>): Node {
	return {
		id: n.id ?? nanoid(5),
		x: n.x ?? 0,
		y: n.y ?? 0,
		width: n.width ?? 140,
		height: n.height ?? 140,
		minWidth: n.minWidth ?? 0,
		minHeight: n.minHeight ?? 0,
		color: n.color ?? '',
		text: n.text ?? '',
		size: n.size ?? DEFAULT_NODE_FONT_SIZE,
		type: n.type ?? DEFAULT_NODE_TYPE,
	};
}

function fillLinkDefaults(l: Partial<Link>): Link {
	if (l.one === undefined || l.two === undefined) {
		throw new Error('every link needs "one" and "two" node ids');
	}
	return {
		one: l.one,
		two: l.two,
		direction: l.direction ?? 'none',
		dash: l.dash ?? DEFAULT_DASH,
		width: l.width ?? DEFAULT_WIDTH,
		color: l.color,
		text: l.text,
	};
}

function setDocument({ documentJson }: { documentJson: string }): string {
	let parsed: { nodes: Partial<Node>[]; links: Partial<Link>[] } = JSON.parse(documentJson);
	if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) {
		throw new Error('documentJson must be shaped like {"nodes": [...], "links": [...]} - the COMPLETE new tree, not a delta');
	}
	let filledNodes = parsed.nodes.map(fillNodeDefaults);
	let ids = new Set(filledNodes.map((n) => n.id));
	for (let l of parsed.links) {
		if (l.one === undefined || !ids.has(l.one)) throw new Error(`link references node id "${l.one}" not present in the "nodes" array`);
		if (l.two === undefined || !ids.has(l.two)) throw new Error(`link references node id "${l.two}" not present in the "nodes" array`);
	}
	let filledLinks = parsed.links.map(fillLinkDefaults);
	nodes.set(filledNodes);
	links.set(filledLinks);
	// $lines (the actual rendered SVG paths) is derived from $nodeMap, not
	// $nodes directly - $nodeMap is only refreshed by makeNodesMap(), and the
	// paths themselves only recomputed by makeLines(). doImport() (the UI's
	// own bulk-load path) calls both after writing nodes/links; without this,
	// links written here silently don't render until some unrelated action
	// (e.g. pressing Tab to add a node) happens to call makeLines() next.
	makeNodesMap(filledNodes);
	makeLines();
	selection.set([]);
	selectedLink.set(UNSELECTED);
	return `document replaced (${filledNodes.length} nodes, ${filledLinks.length} links)`;
}

function requireSelection(min: number = 1): number[] {
	let sel = selection.get();
	if (sel.length < min) {
		throw new Error(`this operation needs at least ${min} selected node(s) - call set_selection first`);
	}
	return sel;
}

function rotateNodeTypeTool(): string {
	requireSelection(1);
	rotateNodeType();
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function rotateNodeSizeTool(): string {
	requireSelection(1);
	rotateNodeSize();
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function requireSelectedLink(): number {
	let i = selectedLink.get();
	if (i === UNSELECTED) throw new Error('no link selected - call set_selected_link with its endpoint ids first');
	return i;
}

function setSelectedLink({ one, two }: { one: string; two: string }): string {
	let allLinks = links.get();
	let idx = findLinkIndex(allLinks, one, two);
	if (idx === -1) throw new Error(`no link between "${one}" and "${two}"`);
	selection.set([]);
	selectedLink.set(idx);
	return JSON.stringify(allLinks[idx]);
}

function rotateLinkDirection(): string {
	let idx = requireSelectedLink();
	rotateArrows();
	return JSON.stringify(links.get()[idx]);
}

function rotateLinkDashTool(): string {
	let idx = requireSelectedLink();
	rotateLineDash();
	return JSON.stringify(links.get()[idx]);
}

function rotateLinkWidthTool(): string {
	let idx = requireSelectedLink();
	rotateLineWidth();
	return JSON.stringify(links.get()[idx]);
}

function alignNodes({ axis }: { axis: 'x' | 'y' }): string {
	requireSelection(2);
	if (axis === 'x') {
		alignLast('x', 'width');
	} else {
		alignLast('y', 'height');
	}
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function centerNodesTool({ axis }: { axis: 'x' | 'y' }): string {
	requireSelection(2);
	center(axis, axis === 'x' ? 'width' : 'height');
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function equalSpacingTool({ axis }: { axis: 'x' | 'y' }): string {
	requireSelection(3);
	equalSpacing(axis, axis === 'x' ? 'width' : 'height');
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function mirrorNodesTool({ axis }: { axis: 'x' | 'y' }): string {
	requireSelection(2);
	mirror(axis, axis === 'x' ? 'width' : 'height');
	return JSON.stringify(selection.get().map((i) => nodes.get()[i]));
}

function setNodeColor({ color }: { color: string }): string {
	let fakeEvent = { detail: hexToRgba(color) } as CustomEvent;
	colorChange(fakeEvent);
	return `color applied to current selection (${color})`;
}

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
	let h = hex.replace('#', '');
	if (h.length === 3) h = h.split('').map((c) => c + c).join('');
	let r = parseInt(h.substring(0, 2), 16);
	let g = parseInt(h.substring(2, 4), 16);
	let b = parseInt(h.substring(4, 6), 16);
	let a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1;
	if ([r, g, b].some((v) => Number.isNaN(v))) throw new Error(`"${hex}" is not a valid hex color like "#3498db"`);
	return { r, g, b, a };
}

(window as any).__mcpTools = [
	{
		name: 'get_document',
		description: `${MOCK_WORKFLOW_NOTE} Returns the WHOLE diagram as {"nodes":[...], "links":[...]} ` +
			'- the single read tool for the tree, covering nodes and links together (same shape a human ' +
			'gets from "export" in the UI, minus the file-save step, and the same shape set_document ' +
			'expects back). Call this once to see current state before planning any change.',
		params: {},
		fn: readDocument,
	},
	{
		name: 'set_document',
		description: `${MOCK_WORKFLOW_NOTE} Replaces the WHOLE diagram from a {"nodes":[...],"links":[...]} ` +
			'JSON string - a full replace, not a merge or delta, so pass the COMPLETE set of nodes and ' +
			'links you want to exist afterward. Clears the current selection. Every link\'s "one"/"two" ' +
			'must reference a node id present in the same "nodes" array you are passing, or this throws. ' +
			'Missing fields are filled with sane defaults: nodes get x/y:0, width/height:140, color:"", ' +
			'text:"", size:"15px", type:0/roundrect, minWidth/minHeight:0, and a freshly generated id if ' +
			'omitted; links get direction:"none", dash:"", width:2 - so you only need to specify what you ' +
			'actually care about (typically a node\'s text/x/y and a link\'s one/two/direction).',
		params: { documentJson: { type: 'string', description: 'JSON-encoded {"nodes":[...],"links":[...]} - the COMPLETE new tree, see EXACT NODE/LINK SHAPE above' } },
		example: { documentJson: '{"nodes":[{"id":"a1","text":"Root","x":0,"y":0},{"id":"a2","text":"Child","x":200,"y":0}],"links":[{"one":"a1","two":"a2","direction":"right"}]}' },
		fn: setDocument,
	},
	{
		name: 'get_selection',
		description: `${MOCK_WORKFLOW_NOTE} Returns whichever node(s) or link the human currently has ` +
			'selected/highlighted in the UI, as {selectedNodes, selectedNodeIndices, selectedLink}. ' +
			'selectedNodes/selectedLink are full node/link objects (or selectedLink:null if none); ' +
			'selectedNodeIndices is their position in get_document\'s "nodes" array at read time (NOT a ' +
			'stable id - use the node objects\' own "id" field for anything durable). Node and link ' +
			'selection are mutually exclusive in this app. Use this so a human can point at exactly which ' +
			'node(s)/link they mean by selecting them in the UI first, instead of you guessing from ' +
			'get_document which ones they intend, and so you can answer questions about "the selected ' +
			'node(s)" without re-reading the whole tree.',
		params: {},
		fn: readSelection,
	},
	{
		name: 'set_selection',
		description: `${MOCK_WORKFLOW_NOTE} Selects the given node ids (replacing any current selection, ` +
			'and clearing any selected link) - required before calling rotate_node_type/rotate_node_size/ ' +
			'align_nodes/center_nodes/equal_spacing_nodes/mirror_nodes/set_node_color, which all act on "the ' +
			'current selection" the same way keyboard shortcuts in the UI do. Unknown ids are silently ' +
			'skipped; the result message reports how many of the requested ids were actually found/selected.',
		params: { nodeIds: { type: 'string', description: 'JSON-encoded array of node id strings to select' } },
		example: { nodeIds: '["abc12","def34"]' },
		fn: writeSelection,
	},
	{
		name: 'set_selected_link',
		description: `${MOCK_WORKFLOW_NOTE} Selects the link between the two given node ids (clearing any ` +
			'node selection) - required before calling rotate_link_direction/rotate_link_dash/' +
			'rotate_link_width, which act on "the currently selected link" the same way keyboard shortcuts do.',
		params: {
			one: { type: 'string', description: 'One endpoint node id' },
			two: { type: 'string', description: 'The other endpoint node id' },
		},
		example: { one: 'abc12', two: 'def34' },
		fn: setSelectedLink,
	},
	{
		name: 'rotate_node_type',
		description: `${MOCK_WORKFLOW_NOTE} Cycles every currently-selected node\'s shape "type" to the ` +
			'next value in order [roundrect(0), rect(1), circle(2), ellipse(3), rhombus(4), parallelogram(5)], ' +
			'wrapping back to roundrect after parallelogram - same as pressing Space with nodes selected in ' +
			'the UI. Call set_selection first. Prefer this over guessing/writing a raw "type" int via ' +
			'set_document since it matches the exact cycle order the UI itself uses.',
		params: {},
		fn: rotateNodeTypeTool,
	},
	{
		name: 'rotate_node_size',
		description: `${MOCK_WORKFLOW_NOTE} Cycles every currently-selected node\'s font "size" to the next ` +
			'value in ["15px","20px","25px","30px"], wrapping around - same as pressing "]" with nodes ' +
			'selected in the UI. Call set_selection first.',
		params: {},
		fn: rotateNodeSizeTool,
	},
	{
		name: 'rotate_link_direction',
		description: `${MOCK_WORKFLOW_NOTE} Cycles the currently-selected link\'s arrow "direction" through ` +
			'["right","left","both","none"] - same as clicking an already-selected link, or pressing Space ' +
			'with a link selected, in the UI. Call set_selected_link first.',
		params: {},
		fn: rotateLinkDirection,
	},
	{
		name: 'rotate_link_dash',
		description: `${MOCK_WORKFLOW_NOTE} Toggles the currently-selected link\'s "dash" between "" (solid) ` +
			'and "4" (dashed) - same as pressing "." with a link selected in the UI. Call set_selected_link ' +
			'first.',
		params: {},
		fn: rotateLinkDashTool,
	},
	{
		name: 'rotate_link_width',
		description: `${MOCK_WORKFLOW_NOTE} Cycles the currently-selected link\'s stroke "width" through ` +
			'[2,4,6] - same as pressing "]" with a link selected in the UI. Call set_selected_link first.',
		params: {},
		fn: rotateLinkWidthTool,
	},
	{
		name: 'align_nodes',
		description: `${MOCK_WORKFLOW_NOTE} Right/bottom-aligns all currently-selected nodes (at least 2) ` +
			'along the given axis - "x" aligns their right edges (same as pressing "R"), "y" aligns their ' +
			'bottom edges (same as pressing "B"). Call set_selection first.',
		params: { axis: { type: 'string', description: '"x" (align right edges) or "y" (align bottom edges)' } },
		example: { axis: 'x' },
		fn: alignNodes,
	},
	{
		name: 'center_nodes',
		description: `${MOCK_WORKFLOW_NOTE} Centers all currently-selected nodes (at least 2) on the same ` +
			'axis line - "x" centers them on a shared vertical line (same as pressing "c"), "y" centers them ' +
			'on a shared horizontal line (same as pressing shift+"C"). Call set_selection first.',
		params: { axis: { type: 'string', description: '"x" (shared vertical center line) or "y" (shared horizontal center line)' } },
		example: { axis: 'y' },
		fn: centerNodesTool,
	},
	{
		name: 'equal_spacing_nodes',
		description: `${MOCK_WORKFLOW_NOTE} Redistributes all currently-selected nodes (at least 3) with ` +
			'equal gaps between them along the given axis, keeping the outermost two nodes fixed - "x" ' +
			'spaces horizontally (same as pressing "d"), "y" spaces vertically (same as pressing shift+"D"). ' +
			'Call set_selection first.',
		params: { axis: { type: 'string', description: '"x" (horizontal spacing) or "y" (vertical spacing)' } },
		example: { axis: 'x' },
		fn: equalSpacingTool,
	},
	{
		name: 'mirror_nodes',
		description: `${MOCK_WORKFLOW_NOTE} Flips the currently-selected nodes\' (at least 2) positions end- ` +
			'to-end along the given axis, like a mirror reflection across the selection\'s own bounding box - ' +
			'"x" mirrors left/right (same as pressing "m"), "y" mirrors top/bottom (same as pressing "M"). ' +
			'Call set_selection first.',
		params: { axis: { type: 'string', description: '"x" (mirror left/right) or "y" (mirror top/bottom)' } },
		example: { axis: 'x' },
		fn: mirrorNodesTool,
	},
	{
		name: 'set_node_color',
		description: `${MOCK_WORKFLOW_NOTE} Sets the fill color of every currently-selected node (if any ` +
			'nodes are selected) or the currently-selected link (if a link is selected instead) - same as ' +
			'picking a color in the UI\'s color picker with something selected. Call set_selection or ' +
			'set_selected_link first. For a single specific node, set_document with just that node\'s ' +
			'"color" changed is equally direct.',
		params: { color: { type: 'string', description: 'Hex color string, e.g. "#3498db" (3, 6, or 8 hex digits)' } },
		example: { color: '#3498db' },
		fn: setNodeColor,
	},
	{
		name: 'get_scene',
		description: `${MOCK_WORKFLOW_NOTE} Returns the canvas' current pan offset as {"x":number,"y":number} ` +
			'- this is the same "scene" the human changes by scrolling/wheeling over the canvas. Node x/y are ' +
			'in canvas coordinates, unaffected by this offset; it only matters if you are trying to reason ' +
			'about what is currently visible on screen.',
		params: {},
		fn: getScene,
	},
	{
		name: 'set_scene',
		description: `${MOCK_WORKFLOW_NOTE} Pans the canvas to the given offset (same effect as the human ` +
			'scrolling/wheeling), e.g. to bring a newly-created node into view. Does not affect any node\'s ' +
			'own x/y.',
		params: {
			x: { type: 'number', description: 'New scene x offset' },
			y: { type: 'number', description: 'New scene y offset' },
		},
		example: { x: 0, y: 0 },
		fn: setScene,
	},
	{
		name: 'get_theme',
		description: 'Returns the current UI theme, "dark" or "light".',
		params: {},
		fn: getTheme,
	},
	{
		name: 'set_theme',
		description: 'Sets the UI theme to "dark" or "light" - same as clicking the theme toggle button.',
		params: { theme: { type: 'string', description: '"dark" or "light"' } },
		example: { theme: 'dark' },
		fn: setTheme,
	},
];

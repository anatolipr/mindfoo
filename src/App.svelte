<script lang="ts">
	import intersect from "path-intersection"
	import {deCasteljau, makeCurve, makeRect} from "./geo"
	import {onMount, tick} from 'svelte';
	import {rgbAsHex, uuidv4} from './util'

	import { type Node } from './data/types'


	import { HsvPicker } from 'svelte-color-picker';

	let mouseX = 0;
	let mouseY = 0;
	let selectionStartX = 0;
	let selectionStartY = 0;

	let selecting = false;

	function resize(i, doLines) {
		if(!nodes0[i]) return
		let rect = document.getElementById(`d${nodes0[i].id}`)
				.getBoundingClientRect();
		nodes0[i].width = rect.width;
		nodes0[i].height = rect.height;
		if (doLines) {
			lines = makeLines(links)
		}
	}

	const directions = ['left', 'right', 'both', 'none'];

	function rotateArrows(i) {
		let nextDirection;
		let currentDirection = directions.indexOf(links[i].direction);

		if (currentDirection < 0) {
			nextDirection = 0;
		} else {
			nextDirection = currentDirection + 1
			if (currentDirection >= directions.length - 1) {
				nextDirection = 0
			}
		}
		links[i].direction = directions[nextDirection]
		links = links
	}

	function lineClick(i) {
		let prevSelected = selectedLink;
		selectedLink = i;
		selection = []
		if (prevSelected !== selectedLink) return
		rotateArrows(i);
	}



	 onMount ( () => {
		for(let i=0; i<nodes0.length; i++) {
			resize(i)
		}
		lines = makeLines(links);

		document.addEventListener('keydown', keydown);
		return () => {
			document.removeEventListener('keydown', keydown)
		}
	})


	let nodes0: Node[] = [
		{
			id: 880,
			width: 0,
			height: 0,
			x: 150,
			y: 50,
			color: '',
			text: 'Coming soon'
		},
		{
			id: 10,
			width: 0,
			height: 0,
			x:100,
			y:350,
			color: '',
			text: 'Test Lorem Ipsum'
		},
		{
			id: 1,
			width: 0,
			height: 0,
			x:320,
			y:50,
			color: '',
			text: 'Test 1'
		},
		{
			id: 2,
			width: 0,
			height: 0,
			x:50,
			y:200,
			color: '',
			text: 'Test 2'
		},
		{
			id: 3,
			minHeight: 0,
			minWidth: 0,
			width: 0,
			height: 0,
			x:300,
			y:400,
			color: '',
			text: 'Test 3'
		}
	];

	async function add() {
		let id = uuidv4();
		let selected = selection.length > 0 ? selection[0] : undefined;
		let x = selected ? nodes0[selected].x + 50 :  mouseX - scene.x;
		let y = selected ? nodes0[selected].y + 50 :  mouseY - scene.y;
		nodes0.push(
				{
					id,
					width: 0,
					height: 0,
					x,
					y,
					text: 'Enter',
					minHeight: 0,
					minWidth: 0,
					color: '',
				}
		);
		selection = [nodes0.length - 1]
		nodes0 = nodes0;
		nodes = makeNodesMap();

		if (selected !== undefined) {
			links.push({
				one: nodes0[selected].id,
				two: id,
				direction: undefined
			});
			await tick();
			resize(nodes0.length-1, true);
			document.getElementById(`d${id}`).focus()
		}

		selection = [nodes0.length-1]
	}

	function makeNodesMap() {
		let rv = {};
		for (let i = 0; i < nodes0.length; ++i)
			rv[nodes0[i].id] = nodes0[i];
		return rv;
	}


	$: nodes = makeNodesMap();


	let links = [
		{
			one: 1,
			two: 2,
			direction: 'both'
		},
		{
			one: 1,
			two: 3,
			direction: 'left'
		},
		{
			one: 10,
			two: 1,
			direction: 'none'
		},
		{
			one: 2,
			two: 3,
			direction: 'right'
		},
		{
			one: 2,
			two: 10,
			direction: 'right'
		},
	]


	let selection = [];
	let previousSelection = [];
	let selectedLink = '';
	let moving = false;

	let scene = {
		x:0, y:0
	}

	function wheel(e) {
		scene.x -= e.deltaX;
		scene.y -= e.deltaY;
	}

	let lineCurveFactor = 0.3
	function makeLines() {

		let result = [];

		for(let i = 0; i<links.length; i++) {

			let link = links[i];

			let node1 = nodes[link.one];
			let node2 = nodes[link.two];
			let cp1, cp2;

			if (node1.x <= node2.x) {
				cp1 = node2.x - (node2.x - node1.x) * lineCurveFactor;
				cp2 = node1.x + (node2.x - node1.x) * lineCurveFactor;
			} else {
				cp2 = node1.x - (node1.x - node2.x) * lineCurveFactor;
				cp1 = node2.x + (node1.x - node2.x) * lineCurveFactor;
			}

			let c = [[node1.x, node1.y],
				[cp1, node1.y],
				[cp2, node2.y],
				[node2.x, node2.y]];

			let i1 = intersect(makeCurve(c), makeRect(node2.width, node2.height, node2.x, node2.y, 8));

			if (i1 && i1[0]) {
				c = deCasteljau(c, i1[0].t1);
				i1 = intersect(makeCurve(c.reverse()), makeRect(node1.width, node1.height, node1.x, node1.y, 8));
				if(i1 && i1[0])
					c = deCasteljau(c, i1[0].t1);
			}

			result.push(
					{	id: node1.id + '-' + node2.id,
						c: makeCurve(c)
					}
			);
		}
		return result;
	}

	function selectNode(i, e) {

		previousSelection = selection;
		let selected = i;
		if (selection.indexOf(i) === -1) {
			selection = [i]
		}


		selectedLink = '';
		moving = true;

		if (e.shiftKey) {
			previousSelection.forEach((i) => {
				if (selection.indexOf(i) === -1) {
					selection.push(i)
				}
			})

		} else if ((e.metaKey || e.button === 2)
				&& selection.length === 1
				&& previousSelection.indexOf(i) === -1) {

			previousSelection.forEach((previous) => {


				let found  = links.find(link =>
						(link.one === nodes0[previous].id &&
								link.two === nodes0[selected].id)
						||
						(link.one === nodes0[selected].id &&
								link.two === nodes0[previous].id)
				)


				if (!found) {
					links.push({
						one: nodes0[previous].id,
						two: nodes0[selected].id,
						direction: 'none'
					});
					links=links;
				}

			})


		}
	}

	function mouseup(e) {
		if (selecting) {
			previousSelection = selection;
			let y = selectionStartY < mouseY ? selectionStartY : mouseY;
			let x = selectionStartX < mouseX ? selectionStartX : mouseX;
			y -= scene.y
			x -= scene.x
			let width = Math.abs(selectionStartX - mouseX)
			let height = Math.abs(selectionStartY - mouseY)
			let x1 = x + width
			let y1 = y + height

			selection = [];
			for(let i = 0; i<nodes0.length; i++) {
				let node = nodes0[i];
				if (x < (node.x - node.width/2)
						&& y < (node.y - node.height/2)
						&& x1 > (node.x + node.width/2)
						&& y1 > (node.y + node.height/2)) {
					selection.push(i);
				}
			}
			if (e.shiftKey) {

				previousSelection.forEach((i) => {
					if (selection.indexOf(i) === -1) {
						selection.push(i)
					}
				})
			}


		}
		moving = false;
		selecting = false;

	}

	function mousemove(e) {
		mouseX = e.clientX;
		mouseY = e.clientY;
		if(selection.length === 0 || !moving) return

		selection.forEach((i) => {
			nodes0[i].x += e.movementX;
			nodes0[i].y += e.movementY;
			nodes0 = nodes0
			lines = makeLines(links)
		})

	}



	function equalSpacing(cProp, diProp) {
		if (selection.length < 3) return
		selection.sort((one, two) => nodes0[one][cProp] < nodes0[two][cProp] ? -1 : 1)

		let first = selection[0];
		let last = selection[selection.length - 1]

		let min = nodes0[first][cProp] - nodes0[first][diProp] / 2;
		let max = nodes0[last][cProp] + nodes0[last][diProp] / 2;
		let totalWidth = selection.map(i => nodes0[i][diProp])
				.reduce((one, two) => one + two, 0);

		let space = ((max - min) - totalWidth) / (selection.length - 1);

		let distance = min
		for (let i = 0; i < selection.length; i++) {
			let s = selection[i]
			nodes0[s][cProp] = distance + nodes0[s][diProp] / 2;
			distance = distance + nodes0[s][diProp] + space;
		}
		nodes0 = nodes0
		lines = makeLines()
	}

	function mirror(cProp, diProp) {
		if (selection.length < 2) return
		selection.sort((one, two) => nodes0[one][cProp] < nodes0[two][cProp] ? -1 : 1)

		let first = selection[0];
		let last = selection[selection.length - 1]

		let min = nodes0[first][cProp] - nodes0[first][diProp] / 2;
		let max = nodes0[last][cProp] + nodes0[last][diProp] / 2;

		selection.forEach((i) => {
			let nodeRight = nodes0[i][cProp] + nodes0[i][diProp] / 2;
			let distanceRight = max - nodeRight;
			nodes0[i][cProp] = min + distanceRight + nodes0[i][diProp] / 2;
		})
		nodes0 = nodes0
		lines = makeLines()
	}

	function alignFirst(cProp, diProp) {
		if (selection.length < 2) return;
		let min;
		selection.forEach((i) => {
			if (min === undefined || nodes0[i][cProp] - nodes0[i][diProp] / 2 < min) {
				min = nodes0[i][cProp] - nodes0[i][diProp] / 2
			}
		})

		selection.forEach((i) => {
			nodes0[i][cProp] = min + nodes0[i][diProp] / 2
		})
		nodes0 = nodes0
		lines = makeLines()
	}

	function alignLast(cProp, diProp) {
		if (selection.length < 2) return;
		let max;
		selection.forEach((i) => {
			if (max === undefined || nodes0[i][cProp] + nodes0[i][diProp] / 2 > max) {
				max = nodes0[i][cProp] + nodes0[i][diProp] / 2
			}
		})

		selection.forEach((i) => {
			nodes0[i][cProp] = max - nodes0[i][diProp] / 2
		})
		nodes0 = nodes0
		lines = makeLines()
	}

	function center(cProp, diProp) {
		if (selection.length < 2) return
		selection.sort((one, two) => nodes0[one][cProp] < nodes0[two][cProp] ? -1 : 1)

		let first = selection[0];
		let last = selection[selection.length - 1]

		let min = nodes0[first][cProp] - nodes0[first][diProp] / 2;
		let max = nodes0[last][cProp] + nodes0[last][diProp] / 2;


		selection.forEach((i) => {
			nodes0[i][cProp] = min + (max - min) / 2
		})

		nodes0 = nodes0
		lines = makeLines()
	}


	function move(cProp, delta) {
		selection.forEach(i => nodes0[i][cProp] += delta);
		nodes0 = nodes0
		lines = makeLines()
	}

	async function keydown(e) {

		if (e.metaKey && e.code === 'KeyA') {
			selection = [...Array(nodes0.length).keys()].map(x => x++);
			return;
		}

		if (selection.length !== 0) {

			if (e.key === 'ArrowLeft') {
				move('x', e.shiftKey ? -10 : -1)
			} else if (e.key === 'ArrowRight') {
				move('x', e.shiftKey ? 10 : 1)
			} else if (e.key === 'ArrowDown') {
				move('y', e.shiftKey ? 10 : 1)
			} else if (e.key === 'ArrowUp') {
				move('y', e.shiftKey ? -10 : -1)
			} else if (e.key === 'C') {
				center('y', 'height');
			} else if (e.key === 'c') {
				center('x', 'width');
			} else if (e.code === 'KeyL') {
				alignFirst('x', 'width');
			} else if (e.code === 'KeyR') {
				alignLast('x', 'width');
			} else if (e.code === 'KeyT') {
				alignFirst('y', 'height');
			} else if (e.code === 'KeyB') {
				alignLast('y', 'height');
			} else if (e.key === 'D') {
				equalSpacing('y', 'height');
			} else if (e.key === 'd') {
				equalSpacing('x', 'width');
			} else if (e.key === 'm') {
				mirror('x', 'width');
			} else if (e.key === 'M') {
				mirror('y', 'height');
			} else if (e.key === 'Tab') {

				e.stopPropagation();
				e.preventDefault();
				await add();

			} else if (e.key === 'Backspace' && (e.metaKey || !editing)) {

				let x = nodes0.length;

				while(x--) {
					if(selection.indexOf(x) > -1) {
						let selected = x;

						let i = links.length;
						while(i--) {
							if (links[i].one === nodes0[selected].id
									|| links[i].two === nodes0[selected].id) {
								links.splice(i, 1);
							}
						}
						lines = makeLines()

						nodes0.splice(selected,1);

						nodes0=nodes0;
					}
				}

				selection = []
				previousSelection = []
			}

		} else if (selectedLink !== '') {

			if (e.key === 'Backspace') {

				links.splice(selectedLink, 1);
				selectedLink = ''
				lines = makeLines();

			} else if (e.key === ' ') {
				rotateArrows(selectedLink)
			}

		}

	}

	function lineDelete(i) {
		links.splice(i, 1);
		selectedLink = ''
		lines = makeLines();
	}

	function bodyMouseDown(e) {
		moving = false;
		editing = false;
		selectedLink = ''
		selecting = true;
		selectionStartX = mouseX;
		selectionStartY = mouseY;
		menu = '';
	}

	function colorChange(e) {
		let c = e.detail;
		let hex = rgbAsHex([c.r, c.g, c.b, Math.round(c.a*255)]);
		selection.forEach(i => nodes0[i].color = hex)
		nodes0 = nodes0
	}
$: lines = makeLines(links)
let editing = false

	function selectText(element) {
		if (document.body.createTextRange) {
			let range = document.body.createTextRange();
			range.moveToElementText(element);
			range.select();
		} else if (window.getSelection) {
			let selection = window.getSelection();
			let range = document.createRange();
			range.selectNodeContents(element);
			selection.removeAllRanges();
			selection.addRange(range);
		}
	}

	async function toggleEdit(id) {
		editing = true;
		await tick();
		let element = document.getElementById(`e${id}`);
		element.focus();
		selectText(element);
	}

	let menu
</script>

{#if nodes0.length === 0}
	<div style="
	position: absolute;
	width:100%;
	height:100%;
	display: flex;
	justify-content: center;
	align-items: center;
	user-select: none;
	color: gray;
	font-size: 18px;
	">Double click somewhere to start</div>
{/if}

<div class="container"
	 style="left:{scene.x}px; top:{scene.y}px;">
	<svg style="overflow:visible">
		<marker id="arrow" viewBox="0 0 10 10" refX="15" refY="5"
				markerWidth="4" markerHeight="5"
				orient="auto-start-reverse">
			<path d="M 0 0 L 15 5 L 0 10 z" />
		</marker>

		{#each lines as line, i (line.id)}
			<path
					class:lineSelected={i === selectedLink}
					on:mousedown|stopPropagation|preventDefault={() => lineClick(i)}
					on:contextmenu|stopPropagation|preventDefault={() => lineDelete(i)}
					class=line fill="none" stroke=black stroke-width=2 d={line.c}
					marker-end="{links[i].direction === 'right' || links[i].direction === 'both' ? 'url(#arrow)' : ''}"
					marker-start="{links[i].direction === 'left' || links[i].direction === 'both' ? 'url(#arrow)' : ''}"
			/>
		{/each}
	</svg>

	{#each nodes0 as node, i (node.id)}
		<div id="d{node.id}" class="item" tabindex="-1"
			 style="left: {node.x - node.width/2}px;
					top: {node.y - node.height/2}px;
					{node.minHeight > 0 ? `min-height:${node.minHeight}px;`:''}
					{node.minWidth > 0 ? `min-width:${node.minWidth}px;`:''}
					background-color: {node.color ? node.color : 'white'}
				   "
			 on:input={() => resize(i, true)}
			 bind:clientWidth={node.width}
			 bind:clientHeight={node.height}
			 on:mousedown|stopPropagation={(e) => selectNode(i, e)}
			 on:contextmenu|stopPropagation|preventDefault={(e) => selectNode(i, e)}
			 on:mouseup={selection = [i]}
			 class:selected={selection.indexOf(i) > -1}>
			{#if editing}
				<div id="e{node.id}"
					 on:blur={()=>editing=false}
					 contenteditable="true"
					 bind:innerHTML={node.text}
					 on:keydown|stopPropagation={() => {}}
				></div>
			{:else}
				<div on:dblclick|stopPropagation={() => toggleEdit(node.id)}>{@html node.text}</div>
			{/if}

		</div>
	{/each}

	{#if selecting}
		<div class="selection"
			 style="
			 	top: {mouseY > selectionStartY ? selectionStartY : mouseY}px;
			 	left: {mouseX > selectionStartX ? selectionStartX : mouseX}px;
			 	width: {Math.abs(mouseX - selectionStartX)}px;
			 	height: {Math.abs(mouseY - selectionStartY)}px;
				"
		></div>
	{/if}

</div>

<div class="menu" on:mousedown|stopPropagation>

	<button on:click={() => menu = menu==='color'?'':'color'}>color</button>
	{#if menu === 'color'}
		<HsvPicker on:colorChange={colorChange} startColor="#ffffff"/>
	{/if}
</div>

<svelte:window on:mousedown="{bodyMouseDown}"
			   on:mouseup={mouseup}
			   on:mousemove={mousemove}
			   on:dblclick={add}
			   on:contextmenu={selecting = false}
			   on:wheel|preventDefault|stopPropagation|capture|nonpassive={wheel}/>

<style>

	.menu {
		position: fixed;
		top: 10px;
		right: 10px;
		user-select: none;
	}
	.selection {
		position: fixed;
		background-color: darkgreen;
		opacity: 0.3;
	}
	.container {
		overflow:visible;
		position: absolute;
	}
	.line:hover {
		stroke:red;
		cursor:pointer;
	}


	.item {
		white-space: nowrap;
		box-sizing: border-box;
		padding: 10px;
		position: absolute;
		background-color: white;
		border: 1px solid black;
		overflow:visible;
		outline:none;
		user-select:none;
		border-radius: 8px;
	}

	.selected {
		border: 1px dashed green;
	}
	.lineSelected {
		stroke: red;
	}
</style>

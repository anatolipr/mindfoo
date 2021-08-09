<script>
	import intersect from "path-intersection"
	import {makeRect, makeCurve, deCasteljau} from "./geo.js"
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { uuidv4 } from './util'


	function resize(id, doLines) {
		let rect = document.getElementById(`d${id}`)
				.getBoundingClientRect();
		nodes[id].width = rect.width;
		nodes[id].height = rect.height;
		if (doLines) {
			lines = makeLines(links)
		}
	}

	const directions = ['left', 'right', 'both', 'none'];

	function lineClick(i) {
		let prevSelected = linkSelected;
		linkSelected = i;
		if (prevSelected != linkSelected) return
		let nextDirection;
		let currentDirection = directions.indexOf(links[i].direction);

		if (currentDirection < 0) {
			nextDirection = 0;
		} else {
			nextDirection = currentDirection + 1
			if(currentDirection >= directions.length - 1) {
				nextDirection = 0
			}
		}
		links[i].direction = directions[nextDirection]
		links = links
	}

	onMount ( () => {
		for(let id in nodes) {
			resize(id)
		}
		lines = makeLines(links)
	})

	let nodes = {
		888: {
			width: 0,
			height: 0,
			x:150,
			y:50,
			text: 'Test Lorem Ipsum'
		},
		0: {
			width: 0,
			height: 0,
			x:100,
			y:350,
			text: 'Test Lorem Ipsum'
		},
		1: {
			width: 0,
			height: 0,
			x:320,
			y:50,
			text: 'Test 1'
		},
		2: {
			width: 0,
			height: 0,
			x:50,
			y:200,
			text: 'Test 1'
		},
		3: {
			width: 100,
			height: 30,
			x:300,
			y:400,
			text: 'Test 2'
		}
	}
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
			one: 0,
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
			two: 0,
			direction: 'right'
		},
	]

	let selected = '';
	let linkSelected = '';
	let moving = false;

	let scene = {
		x:0, y:0
	}

	function wheel(e) {
		scene.x -= e.deltaX;
		scene.y -= e.deltaY;
	}


	function makeLines() {
		let result = [];

		for(let i = 0; i<links.length; i++) {

			let link = links[i];

			let node1 = nodes[link.one];
			let node2 = nodes[link.two];
			let cp1, cp2;

			if (node1.x < node2.x) {
				cp1 = node2.x - (node2.x - node1.x) * 0.2;
				cp2 = node1.x + (node2.x - node1.x) * 0.2;
			} else {
				cp2 = node1.x - (node1.x - node2.x) * 0.2;
				cp1 = node2.x + (node1.x - node2.x) * 0.2;
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
					{
						c: makeCurve(c)}
			);
		}
		return result;
	}

	function mousedown(id, e) {
		selected = id;
		if (selected) moving = true;
	}

	function mouseup() {
		moving = false;
	}

	function mousemove(e) {
		if(!selected || !moving) return
		nodes[selected].x += e.movementX;
		nodes[selected].y += e.movementY;
		lines = makeLines(links)
	}

	async function add() {
		let id = uuidv4();
		let x = selected ? nodes[selected].x : 100;
		let y = selected ? nodes[selected].y : 100;
		nodes[id] = {
			width: 0,
			height: 0,
			x:nodes[selected].x + 50,
			y:nodes[selected].y + 50,
			text: 'Enter'
		}
		if (selected) {
			links.push({
				one: selected,
				two: id,
				direction: undefined
			});
			await tick();
			resize(id, true)
		}

		selected = id;

	}

	async function keyup(e) {
		if (selected && e.key == 'Tab') {
			e.stopPropagation();
			e.preventDefault();
			add()
		}
	}

	function bodyMouseDown() {
		selected = ''
		linkSelected = ''
		console.log('clear')
	}

	$: lines = makeLines(links);

</script>

<div class="container"
	 style="position:absolute; left:{scene.x}px; top:{scene.y}px;">
	<svg style="overflow:visible">
		<marker id="arrow" viewBox="0 0 10 10" refX="15" refY="5"
				markerWidth="4" markerHeight="5"
				orient="auto-start-reverse">
			<path d="M 0 0 L 15 5 L 0 10 z" />
		</marker>

		{#each lines as line, i}
			<path
					class:lineSelected={i === linkSelected}
					on:mousedown|stopPropagation={() => lineClick(i)} class=line fill="none" stroke=black stroke-width=2 d={line.c}
					marker-end="{links[i].direction == 'right' || links[i].direction == 'both' ? 'url(#arrow)' : ''}"
					marker-start="{links[i].direction == 'left' || links[i].direction == 'both' ? 'url(#arrow)' : ''}"
			/>
		{/each}


	</svg>

	{#each Object.entries(nodes) as [id,node]}
		<div id="d{id}" class="item"
			 contenteditable="true"
			 bind:innerHTML={node.text}

			 style="left: {node.x - node.width/2}px;
							top: {node.y - node.height/2}px;
							border-radius: 8px;"
			 on:keyup={() => resize(id, true)}
			 bind:clientWidth={node.width}
			 bind:clientHeight={node.height}
			 on:mousedown|preventDefault|stopPropagation={(e) => mousedown(id, e)}
			 class:selected={selected == id}></div>
	{/each}

</div>


<svelte:window on:keyup="{keyup}"
			   on:mousedown="{() => bodyMouseDown()}"
			   on:mouseup={mouseup}
			   on:mousemove={mousemove}
			   on:wheel|preventDefault|stopPropagation|capture|nonpassive={wheel}/>

<style>
	.container {
		overflow:visible;
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
	}

	.selected {
		border: 1px dashed green;
	}
	.lineSelected {
		stroke-dasharray: 5;
	}
</style>

<script>
	import intersect from "path-intersection"
	import {makeRect, makeCurve, deCasteljau} from "./geo.js"
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import { uuidv4 } from './util'


	function resize(i, doLines) {
		let rect = document.getElementById(`d${nodes0[i].id}`)
				.getBoundingClientRect();
		nodes0[i].width = rect.width;
		nodes0[i].height = rect.height;
		if (doLines) {
			lines = makeLines(links)
		}
	}

	const directions = ['left', 'right', 'both', 'none'];

	function lineClick(i) {
		let prevSelected = linkSelected;
		linkSelected = i;
		selected = '';
		if (prevSelected !== linkSelected) return
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
		for(let i=0; i<nodes0.length; i++) {
			resize(i)
		}
		lines = makeLines(links);

		document.addEventListener('keydown', keydown);
		return () => {
			document.removeEventListener('keydown', keydown)
		}
	})

	let nodes0 = [
		{
			id: 880,
			width: 0,
			height: 0,
			x: 150,
			y: 50,
			text: 'Test Lorem Ipsum 3'
		},
		{
			id: 0,
			width: 0,
			height: 0,
			x:100,
			y:350,
			text: 'Test Lorem Ipsum'
		},
		{
			id: 1,
			width: 0,
			height: 0,
			x:320,
			y:50,
			text: 'Test 1'
		},
		{
			id: 2,
			width: 0,
			height: 0,
			x:50,
			y:200,
			text: 'Test 2'
		},
		{
			id: 3,
			width: 100,
			height: 30,
			x:300,
			y:400,
			text: 'Test 2'
		}
	];

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

	function selectNode(i, e) {
		let previous = selected;
		selected = i;
		linkSelected = '';
		moving = true;

		if (e.metaKey && previous && previous !== i) {

			let found  = links.find(link =>
					link.one === previous &&
					link.one === selected ||
					link.two === previous &&
					link.two === selected
			)
			if (!found) {
				links.push({
					one: nodes0[previous].id,
					two: nodes0[selected].id,
					direction: 'none'
				});
				links=links;
			}
		}
	}

	function mouseup() {
		moving = false;
	}

	function mousemove(e) {
		if(!selected || !moving) return
		nodes0[selected].x += e.movementX;
		nodes0[selected].y += e.movementY;
		lines = makeLines(links)
	}

	async function add() {
		let id = uuidv4();
		let x = selected ? nodes0[selected].x + 50 : 100;
		let y = selected ? nodes0[selected].y + 50 : 100;
		nodes0.push(
			{
				id,
				width: 0,
				height: 0,
				x,
				y,
				text: 'Enter'
			}
		);
		nodes0 = nodes0;
		nodes = makeNodesMap();

		if (selected !== '') {
			links.push({
				one: nodes0[selected].id,
				two: id,
				direction: undefined
			});
			await tick();
			resize(nodes0.length-1, true);
			document.getElementById(`d${id}`).focus()
		}

		selected = nodes0.length-1;

	}

	async function keydown(e) {
// console.log(e)
		if (selected && e.key === 'Tab') {
			e.stopPropagation();
			e.preventDefault();
			await add()
		} else if (selected && e.key === 'Backspace' && e.metaKey) {

			let i = links.length;
			while(i--) {
				if (links[i].one === selected || links[i].two === selected) {
					links.splice(i, 1);
				}
			}

			//delete nodes[selected];
		}

	}

	function bodyMouseDown() {
		selected = ''
		linkSelected = ''
	}

	$: lines = makeLines(links);


</script>

<div class="container"
	 style="left:{scene.x}px; top:{scene.y}px;">
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
					marker-end="{links[i].direction === 'right' || links[i].direction === 'both' ? 'url(#arrow)' : ''}"
					marker-start="{links[i].direction === 'left' || links[i].direction === 'both' ? 'url(#arrow)' : ''}"
			/>
		{/each}
	</svg>

	{#each nodes0 as node, i}
		<div id="d{node.id}" class="item" tabindex="0"
			 contenteditable="true"
			 bind:innerHTML={node.text}

			 style="left: {node.x - node.width/2}px;
							top: {node.y - node.height/2}px;
							border-radius: 8px;"
			 on:keyup={() => resize(i, true)}
			 bind:clientWidth={node.width}
			 bind:clientHeight={node.height}
			 on:mousedown|stopPropagation={(e) => selectNode(i, e)}
			 class:selected={selected === i}></div>
	{/each}

</div>


<svelte:window on:mousedown="{() => bodyMouseDown()}"
			   on:mouseup={mouseup}
			   on:mousemove={mousemove}
			   on:wheel|preventDefault|stopPropagation|capture|nonpassive={wheel}/>

<style>
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
	}

	.selected {
		border: 1px dashed green;
	}
	.lineSelected {
		stroke-dasharray: 5;
	}
</style>

<script lang="ts">
	
	import {onMount, tick} from 'svelte';

	import { 
		$lines as lines, 
		$links as links,
		init, 
		$nodes as nodes, 
		$scene as scene,
		$editing as editing,
		$selection as selection,
		$selectedLink as selectedLink,
		$selectionStart as selectionStart,
        $mouse as mouse,
		$selecting as selecting,
		$menu as menu,
        lineClick,
        lineDelete,
        resize,
        selectNode,
        colorChange,
        doImport,
        doExport,
        bodyMouseDown,
        mousemove,
        mouseup,
        add,
        wheel

	} from './data/store';
	
	import { HsvPicker } from 'svelte-color-picker';
    import type { NodeId } from './data/types';
    import { selectText } from './util';
     
	 onMount ( init )

	 export async function toggleEdit(id: NodeId) {
		editing.set(true);
		await tick();
		let element = document.getElementById(`e${id}`);
		element?.focus();
		selectText(element!);
	}

</script>

{#if $nodes.length === 0}
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
	 style="left:{$scene.x}px; top:{$scene.y}px;">
	<svg style="overflow:visible">
		<marker id="arrow" viewBox="0 0 10 10" refX="15" refY="5"
				markerWidth="4" markerHeight="5"
				orient="auto-start-reverse">
			<path d="M 0 0 L 15 5 L 0 10 z" />
		</marker>

		{#each $lines as line, i (line.id)}
			<path role="none"
					class:lineSelected={i === $selectedLink}
					on:mousedown|stopPropagation|preventDefault={() => lineClick(i)}
					on:contextmenu|stopPropagation|preventDefault={() => lineDelete(i)}
					class=line fill="none" stroke=black stroke-width=2 d={line.c}
					marker-end="{$links[i].direction === 'right' || $links[i].direction === 'both' ? 'url(#arrow)' : ''}"
					marker-start="{$links[i].direction === 'left' || $links[i].direction === 'both' ? 'url(#arrow)' : ''}"
			/>
		{/each}
	</svg>

	{#each $nodes as node, i (node.id)}
		<div id="d{node.id}" class="item" tabindex="-1" role="button"
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
			 
			 class:selected={$selection.indexOf(i) > -1}>
			{#if $editing}
				<div role="none" id="e{node.id}"
					 on:blur={()=>$editing=false}
					 contenteditable="true"
					 bind:innerHTML={node.text}
					 on:keydown|stopPropagation={() => {}}
				></div>
			{:else}
				<div role="none" on:dblclick|stopPropagation={() => toggleEdit(node.id)}>{@html node.text}</div>
			{/if}

		</div>
	{/each}

	{#if $selecting}
		<div class="selection"
			 style="
			 	top: {$mouse.y > $selectionStart.y ? $selectionStart.y : $mouse.y}px;
			 	left: {$mouse.x > $selectionStart.x ? $selectionStart.x : $mouse.x}px;
			 	width: {Math.abs($mouse.x - $selectionStart.x)}px;
			 	height: {Math.abs($mouse.y - $selectionStart.y)}px;
				"
		></div>
	{/if}

</div>

<div role="menu" tabindex="0" class="menu" on:mousedown|stopPropagation>

	<button on:click={() => $menu = $menu==='color'?'':'color'}>color</button>
	{#if $menu === 'color'}
		<HsvPicker on:colorChange={colorChange} startColor="#ffffff"/>
	{/if}
	<button on:click="{doExport}">export</button>
	<button on:click="{doImport}">import</button>
	<button on:click="{() => alert('MindFoo by Anatoli Radulov')}">about</button>
</div>

<svelte:window on:mousedown="{bodyMouseDown}"
			   on:mouseup={mouseup}
			   on:mousemove={mousemove}
			   on:dblclick={add}
			   on:contextmenu={e => $selecting = false}
			   on:wheel|preventDefault|stopPropagation|capture|nonpassive={wheel}/>

<style>

	.menu {
		position: fixed;
		top: 10px;
		right: 10px;
		user-select: none;
		display: flex;
		flex-direction: column;
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

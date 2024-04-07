<script lang="ts">
	
	import {onMount, tick} from 'svelte';
	import { getContrastColor } from 'avos/src/color-util'
	import {$theme as theme} from './data/theme'
	
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
        wheel,
        
        lineText,

        rotateArrows,

        rotateLineDash,

        rotateLineWidth,

        rotateNodeType,

        rotateNodeSize






	} from './data/store';
	
	import { HsvPicker } from 'svelte-color-picker';
    import type { NodeId } from './data/types';
    import { selectText } from './util';
    import { determineArrow } from './data/directions';
    import { toggleTheme } from './data/theme';
    import { makeShape } from './geo';
     
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
	<div class="emptyScene">Double click somewhere to start</div>
{/if}

<div class="container"
	 style="left:{$scene.x}px; top:{$scene.y}px;">
	<svg style="overflow:visible">
		<marker id="arrow" viewBox="0 0 10 15" 
				refX="9" 
				refY="5"
				markerWidth="4" 
				markerHeight="20"
				fill="var(--fg-2)"
				orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 Z" fill="" />
		</marker>

		{#each $lines as line, i (line.id)}
			<path role="none" id="path{i}" 
					class:lineSelected={i === $selectedLink}
					on:mousedown|stopPropagation|preventDefault={() => lineClick(i)}
					on:contextmenu|stopPropagation|preventDefault={() => lineDelete(i)}
					on:dblclick|stopPropagation={() => {}}
					class=line fill="none" 
					stroke={$links[i].color || 'var(--fg-2)'}
					stroke-width={$links[i].width || 2}
					stroke-dasharray={$links[i].dash}
					d={line.c}
					marker-start="{determineArrow(true, line.reverse, $links[i].direction) ? 'url(#arrow)' : ''}"
					marker-end="{determineArrow(false, line.reverse, $links[i].direction) ? 'url(#arrow)' : ''}"
			/>

			{#if $links[i].text}
				<text role="none" dy="-10" 
				style="user-select:none; cursor: pointer;" 
				class:lineSelected={i === $selectedLink}
				on:mousedown|stopPropagation|preventDefault={() => lineClick(i, true)}>
				<textPath 
					dominant-baseline="top" 
					startOffset="50%"
					text-anchor="middle"
					fill={$links[i].color || 'var(--fg-2)'}
					
					href="#path{i}">{$links[i].text}</textPath>
				</text>
		    {/if}
		{/each}

		{#each $nodes as node, i (node.id)}
		<path role="none" 
			class=shp
			class:selected={$selection.indexOf(i) > -1}

			pointer-events="visble"
			on:mousedown|stopPropagation={(e) => selectNode(i, e)}
			on:contextmenu|stopPropagation|preventDefault={(e) => selectNode(i, e)}
			on:dblclick|stopPropagation={() => toggleEdit(node.id)}

			fill={node.color ? node.color : 'var(--bg-1)'}
			stroke={'var(--fg-2)'}
			stroke-width={2}
			d={makeShape(node)}
			/>
		{/each}
	</svg>

	{#each $nodes as node, i (node.id)}
		<div id="d{node.id}" 
			class="item" 
			tabindex="-1" 
			role="button"

			on:mousedown|stopPropagation={()=>{}}
			on:dblclick|stopPropagation={()=>{}}
			on:contextmenu|stopPropagation={()=>{}}

		    style="left: {node.x - node.width/2}px;
					top: {node.y - node.height/2}px;
					font-size: {node.size};
					{node.minHeight > 0 ? `min-height:${node.minHeight}px;`:''}
					{node.minWidth > 0 ? `min-width:${node.minWidth}px;`:''}
					color: {node.color ? getContrastColor(node.color) : 'auto'};
					pointer-events: {$editing  ? 'auto!important':'none'} 
				   "
			 on:input={() => resize(i, true)}
			 bind:clientWidth={node.width}
			 bind:clientHeight={node.height}
			 >
			{#if $editing}
				<div role="none" id="e{node.id}"
					 on:blur={()=>$editing=false}
					 contenteditable="true"
					 bind:innerHTML={node.text}
					 on:keydown|stopPropagation={() => {}}
				></div>
			{:else}
				<div role="none">{@html node.text}</div>
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

<div role="menu" tabindex="0" class="menu" on:mousedown|stopPropagation on:dblclick|stopPropagation={() => {}}>

	<button on:click="{toggleTheme}">{$theme === 'dark' ? 'light' : 'dark'}</button>
	<button on:click={() => $menu = $menu==='color'?'':'color'}>color</button>
	{#if $menu === 'color'}
		<HsvPicker on:colorChange={colorChange} startColor="#ffffff"/>
	{/if}
	<button on:click="{doExport}">export</button>
	<button on:click="{doImport}">import</button>
	{#if $selectedLink > -1}
		<button on:click="{lineText}">line text</button>
		<button on:click="{rotateArrows}">arrows</button>
		<button on:click="{rotateLineDash}">line dash</button>
		<button on:click="{rotateLineWidth}">line width</button>
	{/if}
	
	{#if $selection.length > 0}
	<button on:click="{rotateNodeType}">type</button>
	<button on:click="{rotateNodeSize}">size</button>
	{/if}

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

	.item {
		white-space: nowrap;
		box-sizing: border-box;
		padding: 10px;
		position: absolute;
		overflow:visible;
		outline:none;
		user-select:none;
	}

	.item div {
		text-align: center;
	}

	.selected {
		stroke-dasharray:4;
	}

	.line:hover {
		stroke-opacity: 0.5;
		cursor:pointer;
	}

	.lineSelected {
		stroke-opacity: 0.5;
	}

	.emptyScene {
		position: absolute;
		width:100%;
		height:100%;
		display: flex;
		justify-content: center;
		align-items: center;
		user-select: none;
		color: gray;
		font-size: 18px;
	}
</style>

import { useEffect, useRef, useState } from "react"
import { PluginUIContext } from "molstar/lib/mol-plugin-ui/context"
import { Plugin } from "molstar/lib/mol-plugin-ui/plugin"
import { DefaultPluginUISpec } from "molstar/lib/mol-plugin-ui/spec"
import { StructureQuickStylesControls } from "molstar/lib/mol-plugin-ui/structure/quick-styles"
import { StructureComponentControls } from "molstar/lib/mol-plugin-ui/structure/components"
import { StructureMeasurementsControls } from "molstar/lib/mol-plugin-ui/structure/measurements"
import { PluginConfig } from "molstar/lib/mol-plugin/config"
import type { Model } from "molstar/lib/mol-model/structure"
import { alphaFold3ConfidenceTheme } from "@/alphafold3-structure"
import { Button } from "@/components/ui/button"
import "molstar/build/viewer/molstar.css"
import "./alphafold3-structure.css"

class CollapsedMeasurements extends StructureMeasurementsControls {
  override defaultState() { return { ...super.defaultState(), isCollapsed: true } }
}

function StructureTools() {
  return <><StructureQuickStylesControls /><StructureComponentControls /><CollapsedMeasurements /></>
}

export default function AlphaFold3Structure({ cif, onModelReady }: { cif: string; onModelReady: (model: Model) => void }) {
  const [plugin, setPlugin] = useState<PluginUIContext | null>(null)
  const [error, setError] = useState("")
  const [ready, setReady] = useState(false)
  const [themes, setThemes] = useState<string[]>([])
  const [colorBusy, setColorBusy] = useState(false)
  const onModel = useRef(onModelReady)
  onModel.current = onModelReady

  useEffect(() => {
    let active = true
    let initialized = false
    let disposed = false
    const spec = DefaultPluginUISpec()
    const instance = new PluginUIContext({
      ...spec,
      actions: [],
      animations: [],
      layout: { initial: { isExpanded: false, showControls: true, controlsDisplay: "landscape" } },
      components: {
        controls: { left: "none", bottom: "none" }, remoteState: "none",
        structureTools: StructureTools, disableDragOverlay: true,
      },
      config: [
        [PluginConfig.VolumeStreaming.Enabled, false],
        [PluginConfig.Viewport.ShowAnimation, false],
        [PluginConfig.Viewport.ShowTrajectoryControls, false],
        [PluginConfig.Viewport.ShowXR, "never"],
      ],
    })
    const dispose = () => { if (!disposed) { disposed = true; instance.dispose() } }
    const subscription = instance.state.data.events.changed.subscribe(() => {
      if (!active) return
      const names = instance.managers.structure.hierarchy.current.structures.flatMap((structure) =>
        structure.components.flatMap((component) => component.representations.map((representation) =>
          representation.cell.params?.values.colorTheme.name as string)))
      setThemes([...new Set(names.filter(Boolean))])
    })
    setReady(false)
    setError("")
    async function load() {
      try {
        await instance.init()
        initialized = true
        if (!active) { dispose(); return }
        instance.representation.structure.themes.colorThemeRegistry.add(alphaFold3ConfidenceTheme)
        setPlugin(instance)
        await instance.canvas3dInitialized
        if (!active) return
        if (!instance.canvas3d) throw new Error("WebGL is unavailable.")
        const data = await instance.builders.data.rawData({ data: cif, label: "Highest-ranked prediction" })
        if (!active) return
        const trajectory = await instance.builders.structure.parseTrajectory(data, "mmcif")
        if (!active) return
        const model = await instance.builders.structure.createModel(trajectory)
        if (!active) return
        const structure = await instance.builders.structure.createStructure(model)
        if (!active) return
        await instance.builders.structure.representation.applyPreset(structure, "polymer-and-ligand")
        if (!active) return
        await applyColor(instance, alphaFold3ConfidenceTheme.name)
        if (!active) return
        if (model.data) onModel.current(model.data)
        setReady(true)
      } catch {
        if (active) setError("The structure viewer could not load. WebGL is required; the result archive and PAE remain available.")
      } finally {
        if (!active) dispose()
      }
    }
    void load()
    return () => { active = false; subscription.unsubscribe(); if (initialized) dispose() }
  }, [cif])

  async function changeColor(name: string) {
    if (!plugin) return
    setColorBusy(true)
    try { await applyColor(plugin, name) } catch { setError("The color change could not be applied. Try another style.") } finally { setColorBusy(false) }
  }

  return (
    <div className="space-y-3">
      {error ? <p role="alert" className="rounded-lg bg-muted p-4">{error}</p> : null}
      {!error && !ready ? <p role="status">Loading structure viewer…</p> : null}
      <div className="af3-molstar relative h-[680px] overflow-hidden rounded-lg border" aria-label="Interactive molecular structure" onDropCapture={(event) => { event.preventDefault(); event.stopPropagation() }} onDragOverCapture={(event) => { event.preventDefault(); event.stopPropagation() }}>
        {plugin ? <Plugin plugin={plugin} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">Color:</span>
        <Button disabled={!ready || colorBusy} onClick={() => void changeColor(alphaFold3ConfidenceTheme.name)} type="button" variant="outline">Residue pLDDT</Button>
        <Button disabled={!ready || colorBusy} onClick={() => void changeColor("chain-id")} type="button" variant="outline">Chain</Button>
      </div>
      {themes.length === 1 && themes[0] === alphaFold3ConfidenceTheme.name ? (
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Residue pLDDT legend">
          <span>Polymer residue-mean pLDDT:</span>
          {[["#0053d6", "Very high (>90)"], ["#65cbf3", "Confident (>70–90)"], ["#ffdb13", "Low (>50–70)"], ["#ff7d45", "Very low (≤50)"]].map(([color, label]) => <span className="inline-flex items-center gap-2" key={label}><i className="inline-block size-3 rounded-sm" style={{ backgroundColor: color }} />{label}</span>)}
          <span>Ligands: element colors. Missing scores: gray.</span>
        </div>
      ) : <p className="text-sm text-muted-foreground">{themes.length === 1 && themes[0] === "chain-id" ? "Colored by chain." : "Colors follow the current component styles."} Choose Residue pLDDT to restore confidence coloring.</p>}
    </div>
  )
}

async function applyColor(plugin: PluginUIContext, name: string) {
  const update = plugin.state.data.build()
  for (const structure of plugin.managers.structure.hierarchy.current.structures) {
    for (const component of structure.components) {
      for (const representation of component.representations) {
        update.to(representation.cell).update((params) => { params.colorTheme = { name, params: {} } })
      }
    }
  }
  await update.commit()
}

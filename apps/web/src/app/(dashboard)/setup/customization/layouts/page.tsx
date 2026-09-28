"use client";

import * as React from "react";
import { ChevronDown, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { modulesApi, fieldsApi, objectManagerApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ModuleDefinition { id: string; name: string; pluralLabel: string; isActive: boolean; }
interface FieldDefinition { id: string; name: string; label: string; fieldType: string; isActive: boolean; isSystemField: boolean; }
interface LayoutSection { name: string; fields: string[]; }
interface Layout { id: string; name: string; isDefault: boolean; sections: LayoutSection[] | string; }

function parseSections(value: Layout["sections"]): LayoutSection[] {
  if (Array.isArray(value)) return value.map((section) => ({ name: section.name || "Section", fields: Array.isArray(section.fields) ? section.fields : [] }));
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parseSections(parsed) : []; } catch { return []; }
}

export default function LayoutsPage() {
  const { toast } = useToast();
  const [modules, setModules] = React.useState<ModuleDefinition[]>([]);
  const [selectedModule, setSelectedModule] = React.useState("");
  const [fields, setFields] = React.useState<FieldDefinition[]>([]);
  const [layouts, setLayouts] = React.useState<Layout[]>([]);
  const [selectedLayout, setSelectedLayout] = React.useState<Layout | null>(null);
  const [sections, setSections] = React.useState<LayoutSection[]>([]);
  const [layoutName, setLayoutName] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newSectionName, setNewSectionName] = React.useState("");

  const loadModules = React.useCallback(async () => {
    try {
      const response = await modulesApi.list(false);
      const activeModules = (Array.isArray(response.data.data) ? response.data.data : []).filter((module: ModuleDefinition) => module.isActive);
      setModules(activeModules);
      setSelectedModule((current) => current || activeModules[0]?.name || "");
    } catch (error: any) { toast({ title: "Unable to load modules", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any }); }
  }, [toast]);

  const loadModuleData = React.useCallback(async () => {
    if (!selectedModule) { setLoading(false); return; }
    try {
      setLoading(true);
      const [fieldResponse, layoutResponse] = await Promise.all([fieldsApi.list(selectedModule, false), objectManagerApi.listLayouts(selectedModule)]);
      setFields(Array.isArray(fieldResponse.data.data) ? fieldResponse.data.data : []);
      const nextLayouts = (Array.isArray(layoutResponse.data.data) ? layoutResponse.data.data : []).map((layout: Layout) => ({ ...layout, sections: parseSections(layout.sections) }));
      setLayouts(nextLayouts);
      const defaultLayout = nextLayouts.find((layout) => layout.isDefault) || nextLayouts[0] || null;
      setSelectedLayout(defaultLayout);
      setLayoutName(defaultLayout?.name || "");
      setIsDefault(defaultLayout?.isDefault || false);
      setSections(defaultLayout ? parseSections(defaultLayout.sections) : []);
    } catch (error: any) { toast({ title: "Unable to load layouts", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any }); }
    finally { setLoading(false); }
  }, [selectedModule, toast]);

  React.useEffect(() => { void loadModules(); }, [loadModules]);
  React.useEffect(() => { void loadModuleData(); }, [loadModuleData]);

  const selectLayout = (layout: Layout) => { setSelectedLayout(layout); setLayoutName(layout.name); setIsDefault(layout.isDefault); setSections(parseSections(layout.sections)); };
  const createLayout = () => { setSelectedLayout(null); setLayoutName(""); setIsDefault(false); setSections(fields.length ? [{ name: "Main Information", fields: fields.map((field) => field.name) }] : []); setCreateOpen(true); };
  const addSection = () => { if (!newSectionName.trim()) return; setSections((current) => [...current, { name: newSectionName.trim(), fields: [] }]); setNewSectionName(""); };
  const removeSection = (index: number) => setSections((current) => current.filter((_, sectionIndex) => sectionIndex !== index));
  const moveField = (fieldName: string, sectionIndex: number) => setSections((current) => current.map((section, index) => ({ ...section, fields: index === sectionIndex ? [...section.fields.filter((name) => name !== fieldName), fieldName] : section.fields.filter((name) => name !== fieldName) })));
  const fieldInSection = (fieldName: string) => sections.some((section) => section.fields.includes(fieldName));

  const saveLayout = async () => {
    if (!selectedModule || !layoutName.trim() || sections.length === 0) { toast({ title: "Layout details required", description: "Select a module, enter a layout name, and add at least one section.", variant: "destructive" as any }); return; }
    try {
      setSaving(true);
      const payload = { name: layoutName.trim(), isDefault, sections };
      if (selectedLayout) await objectManagerApi.updateLayout(selectedModule, selectedLayout.id, payload);
      else await objectManagerApi.createLayout(selectedModule, payload);
      setCreateOpen(false);
      await loadModuleData();
      toast({ title: selectedLayout ? "Layout updated" : "Layout created", description: `${layoutName.trim()} is ready.` });
    } catch (error: any) { toast({ title: "Unable to save layout", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any }); }
    finally { setSaving(false); }
  };

  const deleteLayout = async () => {
    if (!selectedLayout || selectedLayout.isDefault) return;
    try { await objectManagerApi.deleteLayout(selectedModule, selectedLayout.id); await loadModuleData(); toast({ title: "Layout deleted", description: `${selectedLayout.name} was removed.` }); }
    catch (error: any) { toast({ title: "Unable to delete layout", description: error?.response?.data?.error || error?.message || "Try again.", variant: "destructive" as any }); }
  };

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4 border-b pb-6"><div><p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Setup / Customization</p><h1 className="mt-1 text-xl font-semibold tracking-tight">Layouts</h1><p className="mt-2 text-muted-foreground">Arrange fields into create, edit, and view screens for each module.</p></div><Button onClick={createLayout} disabled={!selectedModule}><Plus className="mr-2 h-4 w-4" />New Layout</Button></div>
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit"><CardHeader><CardTitle>Module</CardTitle><select value={selectedModule} onChange={(event) => setSelectedModule(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">{modules.map((module) => <option key={module.id} value={module.name}>{module.pluralLabel}</option>)}</select></CardHeader><CardContent className="space-y-2">{layouts.map((layout) => <button key={layout.id} type="button" onClick={() => selectLayout(layout)} className={`w-full rounded-md border p-3 text-left ${selectedLayout?.id === layout.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{layout.name}</span>{layout.isDefault && <Badge variant="secondary">Default</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{parseSections(layout.sections).length} sections</p></button>)}</CardContent></Card>
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{selectedLayout?.name || "Create a layout"}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{modules.find((module) => module.name === selectedModule)?.pluralLabel || selectedModule}</p></div><div className="flex gap-2">{selectedLayout && !selectedLayout.isDefault && <Button variant="outline" onClick={deleteLayout}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>}{selectedLayout && <Button onClick={() => setCreateOpen(true)}><PencilIcon />Edit Layout</Button>}</div></div></CardHeader><CardContent>{loading ? <p className="py-10 text-center text-muted-foreground">Loading layouts...</p> : !selectedLayout ? <p className="py-10 text-center text-muted-foreground">Create a layout to arrange fields.</p> : <LayoutBuilder sections={sections} fields={fields} fieldInSection={fieldInSection} moveField={moveField} removeSection={removeSection} />}</CardContent></Card>
    </div>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{selectedLayout ? "Edit Layout" : "Create Layout"}</DialogTitle><DialogDescription>Arrange available fields into sections for this module.</DialogDescription></DialogHeader><div className="grid gap-6 py-3 lg:grid-cols-[220px_1fr]"><div className="space-y-3 rounded-lg border p-4"><div className="flex items-center justify-between"><Label>Available Fields</Label><span className="text-xs text-muted-foreground">{fields.length}</span></div>{fields.map((field) => <button key={field.id} type="button" onClick={() => moveField(field.name, 0)} className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm ${fieldInSection(field.name) ? "text-muted-foreground" : "hover:border-primary"}`}><GripVertical className="h-4 w-4" />{field.label}</button>)}</div><div className="space-y-4"><div className="flex flex-wrap items-end gap-2"><div className="flex-1 space-y-2"><Label>Layout Name *</Label><Input value={layoutName} onChange={(event) => setLayoutName(event.target.value)} placeholder="Lead Layout" /></div><label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />Default</label></div>{sections.map((section, index) => <div key={`${section.name}-${index}`} className="rounded-lg border p-4"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-medium">{section.name}</h3><Button variant="ghost" size="icon" onClick={() => removeSection(index)} title="Remove section"><Trash2 className="h-4 w-4 text-destructive" /></Button></div><div className="grid gap-2 sm:grid-cols-2">{section.fields.map((fieldName) => { const field = fields.find((item) => item.name === fieldName); return <div key={fieldName} className="rounded-md border bg-muted/20 p-3 text-sm">{field?.label || fieldName}</div>; })}</div>{section.fields.length === 0 && <p className="text-sm text-muted-foreground">Click an available field to add it to the first section.</p>}</div>)}<div className="flex gap-2"><Input value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} placeholder="New section name" /><Button type="button" variant="outline" onClick={addSection}><Plus className="mr-2 h-4 w-4" />Add Section</Button></div></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={saveLayout} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save Layout"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function PencilIcon() { return <span className="mr-2 inline-block">Edit</span>; }
function LayoutBuilder({ sections, fields, fieldInSection, moveField, removeSection }: { sections: LayoutSection[]; fields: FieldDefinition[]; fieldInSection: (name: string) => boolean; moveField: (name: string, index: number) => void; removeSection: (index: number) => void }) { return <div className="space-y-4">{sections.map((section, index) => <section key={`${section.name}-${index}`} className="rounded-lg border p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-medium">{section.name}</h3><span className="text-xs text-muted-foreground">{section.fields.length} fields</span></div><div className="grid gap-3 sm:grid-cols-2">{section.fields.map((name) => <div key={name} className="rounded-md border bg-muted/20 p-3 text-sm">{fields.find((field) => field.name === name)?.label || name}</div>)}</div></section>)}{!sections.length && <p className="py-8 text-center text-muted-foreground">No sections configured.</p>}</div>; }

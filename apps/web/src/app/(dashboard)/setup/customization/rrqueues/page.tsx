"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Info, MoreHorizontal, Plus, Search, Users } from "lucide-react";
import { rrQueueApi, userApi } from "@/lib/api";
import { UserLookup } from "@/components/crm/user-lookup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function RRQueuesPage() {
  const { toast } = useToast();
  const [queues, setQueues] = React.useState<any[]>([]);
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [nameError, setNameError] = React.useState(false);
  const [leadStatus, setLeadStatus] = React.useState<string[]>([]);
  const [leadSource, setLeadSource] = React.useState<string[]>([]);
  const [projectInterested, setProjectInterested] = React.useState<string[]>([]);
  const [newOwnerId, setNewOwnerId] = React.useState("");
  const [leadCount, setLeadCount] = React.useState("0");
  const [previousId, setPreviousId] = React.useState("0");
  const [saving, setSaving] = React.useState(false);
  const [users, setUsers] = React.useState<any[]>([]);
  const [options, setOptions] = React.useState<{ statuses: any[]; sources: any[]; projects: any[] }>({ statuses: [], sources: [], projects: [] });
  const [ownerQueue, setOwnerQueue] = React.useState<any>(null);
  const [ownerId, setOwnerId] = React.useState("");
  const [ownerDialogOpen, setOwnerDialogOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try { setQueues((await rrQueueApi.list(search ? { search } : undefined)).data.data || []); }
    catch (error: any) { toast({ title: "Unable to load queues", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }); }
  }, [search, toast]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    userApi.list({ limit: 200 })
      .then((response) => setUsers(response.data.data || []))
      .catch((error: any) => toast({ title: "Unable to load users", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }));
  }, [toast]);

  React.useEffect(() => {
    rrQueueApi.options()
      .then((response) => setOptions(response.data.data || { statuses: [], sources: [], projects: [] }))
      .catch((error: any) => toast({ title: "Unable to load queue options", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }));
  }, [toast]);

  const resetNewQueue = () => {
    setName("");
    setNameError(false);
    setLeadStatus([]);
    setLeadSource([]);
    setProjectInterested([]);
    setNewOwnerId("");
    setLeadCount("0");
    setPreviousId("0");
  };

  const create = async (saveAndNew = false) => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    try {
      setSaving(true);
      await rrQueueApi.create({
        name: name.trim(),
        leadStatus,
        projectInterested,
        excludeFromNoSource: leadSource,
        presalesQueue: false,
        ownerId: newOwnerId || null,
        leadCount: Number(leadCount) || 0,
        previousId: Number(previousId) || 0,
      });
      await load();
      if (saveAndNew) resetNewQueue();
      else { resetNewQueue(); setOpen(false); }
    } catch (error: any) { toast({ title: "Unable to create queue", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this RRQueue? Existing lead ownership will remain unchanged.")) return;
    try { setSaving(true); await rrQueueApi.remove(id); await load(); }
    catch (error: any) { toast({ title: "Unable to delete queue", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any }); }
    finally { setSaving(false); }
  };

  const saveOwner = async () => {
    if (!ownerQueue) return;
    try {
      setSaving(true);
      await rrQueueApi.update(ownerQueue.id, { ownerId: ownerId || null });
      setOwnerDialogOpen(false);
      setOwnerQueue(null);
      await load();
      toast({ title: "Owner updated", description: "The RRQueue owner was changed." });
    } catch (error: any) {
      toast({ title: "Unable to change owner", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-sm text-muted-foreground">Setup / Customization</p><h1 className="text-2xl font-semibold">RRQueues</h1><p className="text-sm text-muted-foreground">Manage persistent sequential lead assignment queues.</p></div>
      <Button onClick={() => { resetNewQueue(); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />New RRQueue</Button>
    </div>
    <div className="relative max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search this list..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    <Card><CardHeader><CardTitle>Queue list</CardTitle></CardHeader><CardContent>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Name</th><th className="p-3">Owner</th><th className="p-3">No. of users</th><th className="p-3">Lead count</th><th className="p-3">Previous ID</th><th className="w-12 p-3"><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {queues.map((queue) => <tr key={queue.id} className="border-b last:border-0"><td className="p-3 font-medium"><Link className="text-primary hover:underline" href={`/setup/customization/rrqueues/${queue.id}`}>{queue.name}</Link></td><td className="p-3">{queue.owner ? `${queue.owner.firstName} ${queue.owner.lastName}` : "Unassigned"}</td><td className="p-3"><span className="inline-flex items-center gap-1"><Users className="h-4 w-4" />{queue.noOfUsers}</span></td><td className="p-3">{queue.leadCount}</td><td className="p-3">{queue.previousId}</td><td className="p-2"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${queue.name}`} title="Queue actions" disabled={saving}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={`/setup/customization/rrqueues/${queue.id}`}>Edit</Link></DropdownMenuItem><DropdownMenuItem className="text-destructive" onSelect={() => void remove(queue.id)}>Delete</DropdownMenuItem><DropdownMenuItem onSelect={() => { setOwnerQueue(queue); setOwnerId(queue.ownerId || ""); setOwnerDialogOpen(true); }}>Change Owner</DropdownMenuItem><DropdownMenuItem disabled title="Labels are not configured for RRQueues">Edit Labels</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td></tr>)}
        {!queues.length && <tr><td className="p-8 text-center text-muted-foreground" colSpan={6}>No RRQueues found.</td></tr>}
      </tbody></table></div>
    </CardContent></Card>
    <Dialog open={open} onOpenChange={(isOpen) => { if (!saving) { setOpen(isOpen); if (!isOpen) resetNewQueue(); } }}>
      <DialogContent className="max-h-[92vh] max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5"><DialogTitle className="text-center text-2xl font-medium text-muted-foreground">New RRQueue</DialogTitle></DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
          <p className="text-right text-sm text-muted-foreground"><span className="text-destructive">*</span> = Required Information</p>
          <div className="rounded-md bg-muted px-4 py-3 text-lg text-muted-foreground">Information</div>
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            <div className="grid grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label htmlFor="rrqueue-name">Name <span className="text-destructive">*</span></Label><div><Input id="rrqueue-name" autoFocus aria-invalid={nameError} className={nameError ? "border-destructive bg-destructive/5" : ""} value={name} onChange={(event) => { setName(event.target.value); if (event.target.value.trim()) setNameError(false); }} />{nameError && <p className="mt-1 text-xs text-destructive">Complete this field.</p>}</div></div>
            <div className="grid grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label htmlFor="rrqueue-new-owner">Owner</Label><UserLookup id="rrqueue-new-owner" ariaLabel="Owner" users={users.filter((user) => user.isActive)} value={newOwnerId} onChange={setNewOwnerId} placeholder="Unassigned or search users..." /></div>
            <DualListField label="Lead Status" options={options.statuses} value={leadStatus} onChange={setLeadStatus} info />
            <DualListField label="Lead Source" options={options.sources} value={leadSource} onChange={setLeadSource} />
            <DualListField label="Project Interested" options={options.projects} value={projectInterested} onChange={setProjectInterested} />
            <div className="grid content-start gap-4">
              <div className="grid grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label htmlFor="rrqueue-lead-count">Lead Count <Info className="inline h-4 w-4 rounded-full fill-red-700 text-white" /></Label><Input id="rrqueue-lead-count" type="number" min="0" step="1" value={leadCount} onChange={(event) => setLeadCount(event.target.value)} /></div>
              <div className="grid grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] items-center gap-4"><Label htmlFor="rrqueue-previous-id">Previous id <Info className="inline h-4 w-4 rounded-full fill-red-700 text-white" /></Label><Input id="rrqueue-previous-id" type="number" min="0" step="1" value={previousId} onChange={(event) => setPreviousId(event.target.value)} /></div>
            </div>
          </div>
        </div>
        <DialogFooter className="border-t px-6 py-4 sm:justify-center">
          <Button variant="outline" onClick={() => { resetNewQueue(); setOpen(false); }} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={() => void create(true)} disabled={saving}>{saving ? "Saving..." : "Save & New"}</Button>
          <Button onClick={() => void create(false)} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={ownerDialogOpen} onOpenChange={(isOpen) => { setOwnerDialogOpen(isOpen); if (!isOpen) setOwnerQueue(null); }}><DialogContent><DialogHeader><DialogTitle>Change Owner</DialogTitle></DialogHeader><div className="space-y-2"><Label htmlFor="rrqueue-owner">Owner</Label><UserLookup id="rrqueue-owner" ariaLabel="Owner" users={users.filter((user) => user.isActive)} value={ownerId} onChange={setOwnerId} placeholder="Unassigned or search users..." selectedUser={ownerQueue?.owner} /></div><DialogFooter><Button variant="outline" onClick={() => setOwnerDialogOpen(false)} disabled={saving}>Cancel</Button><Button onClick={() => void saveOwner()} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function DualListField({ label, options, value, onChange, info = false }: { label: string; options: Array<string | { value: string; label: string }>; value: string[]; onChange: (value: string[]) => void; info?: boolean }) {
  const [selectedAvailable, setSelectedAvailable] = React.useState("");
  const [selectedChosen, setSelectedChosen] = React.useState("");
  const normalized = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const available = normalized.filter((option) => !value.includes(option.value));
  return <div className="space-y-1"><p className="flex items-center gap-2 text-sm font-semibold">{label}{info && <Info className="h-4 w-4 rounded-full fill-red-700 text-white" />}</p><div className="grid grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)] items-center gap-2"><div><p className="mb-1 text-xs font-medium text-muted-foreground">Available</p><select aria-label={`${label} available`} multiple size={6} value={selectedAvailable ? [selectedAvailable] : []} onChange={(event) => setSelectedAvailable(event.target.value)} className="h-36 w-full rounded-md border bg-background p-2 text-sm">{available.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div className="grid gap-2"><Button type="button" variant="ghost" size="icon" aria-label={`Add ${label}`} disabled={!selectedAvailable} onClick={() => { if (selectedAvailable) { onChange([...value, selectedAvailable]); setSelectedAvailable(""); } }}><ChevronRight className="h-4 w-4 text-primary" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label}`} disabled={!selectedChosen} onClick={() => { if (selectedChosen) { onChange(value.filter((item) => item !== selectedChosen)); setSelectedChosen(""); } }}><ChevronLeft className="h-4 w-4 text-primary" /></Button></div><div><p className="mb-1 text-xs font-medium text-muted-foreground">Chosen</p><select aria-label={`${label} chosen`} multiple size={6} value={selectedChosen ? [selectedChosen] : []} onChange={(event) => setSelectedChosen(event.target.value)} className="h-36 w-full rounded-md border bg-background p-2 text-sm">{value.map((item) => <option key={item} value={item}>{normalized.find((option) => option.value === item)?.label || item}</option>)}</select></div></div></div>;
}

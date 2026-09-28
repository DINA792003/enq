"use client";

import * as React from "react";
import { Users, UserPlus, UserMinus, AlertTriangle, Settings, Plus, Trash2 } from "lucide-react";
import { roundRobinApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Member {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
    profile?: { id: string; name: string } | null;
  };
  isActive: boolean;
  poolType: string;
  createdAt: string;
}

interface EligibleUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profile?: { id: string; name: string } | null;
}

interface PoolConfig {
  id: string;
  tenantId: string;
  poolType: string;
  name: string;
  description: string | null;
  profileName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const AVAILABLE_PROFILES = [
  { name: "Presales", label: "Presales" },
  { name: "SVC", label: "SVC" },
  { name: "Sales", label: "Sales" },
  { name: "Marketing", label: "Marketing" },
  { name: "Finance", label: "Finance" },
  { name: "Recovery", label: "Recovery" },
  { name: "Admin", label: "Admin" },
];

export default function RoundRobinPage() {
  const { toast } = useToast();
  const [members, setMembers] = React.useState<Record<string, Member[]>>({});
  const [configs, setConfigs] = React.useState<PoolConfig[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);

  const [selectedPool, setSelectedPool] = React.useState<string>("");
  const [eligibleUsers, setEligibleUsers] = React.useState<EligibleUser[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState<string>("");
  const [removingMember, setRemovingMember] = React.useState<Member | null>(null);
  const [deletingConfig, setDeletingConfig] = React.useState<PoolConfig | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [newConfig, setNewConfig] = React.useState({ poolType: "", name: "", description: "", profileName: "" });

  const loadAll = React.useCallback(async () => {
    try {
      setLoading(true);
      const [membersRes, configsRes] = await Promise.all([
        roundRobinApi.getAll(),
        roundRobinApi.getConfigs(),
      ]);
      setMembers(membersRes.data.data);
      setConfigs(configsRes.data.data || []);
    } catch (error: any) {
      toast({ title: "Failed to load Round Robin configuration", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { void loadAll(); }, [loadAll]);

  const openAddDialog = async (poolType: string) => {
    setSelectedPool(poolType);
    setSelectedUserId("");
    try {
      const response = await roundRobinApi.getEligible(poolType);
      setEligibleUsers(response.data.data || []);
    } catch {
      setEligibleUsers([]);
    }
    setAddDialogOpen(true);
  };

  const handleAdd = async () => {
    if (!selectedUserId || !selectedPool) return;
    try {
      setSaving(true);
      await roundRobinApi.addMember(selectedUserId, selectedPool);
      setAddDialogOpen(false);
      await loadAll();
      toast({ title: "Member added", description: "User added to Round Robin pool." });
    } catch (error: any) {
      toast({ title: "Failed to add member", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    } finally {
      setSaving(false);
    }
  };

  const openRemoveDialog = (member: Member) => {
    setRemovingMember(member);
    setRemoveDialogOpen(true);
  };

  const handleRemove = async () => {
    if (!removingMember) return;
    try {
      setSaving(true);
      await roundRobinApi.removeMember(removingMember.id);
      setRemoveDialogOpen(false);
      setRemovingMember(null);
      await loadAll();
      toast({ title: "Member removed", description: "User removed from Round Robin pool." });
    } catch (error: any) {
      toast({ title: "Failed to remove member", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateConfig = async () => {
    if (!newConfig.poolType || !newConfig.name || !newConfig.profileName) return;
    try {
      setSaving(true);
      await roundRobinApi.createConfig(newConfig);
      setCreateDialogOpen(false);
      setNewConfig({ poolType: "", name: "", description: "", profileName: "" });
      await loadAll();
      toast({ title: "Round Robin created", description: `New pool "${newConfig.name}" has been created.` });
    } catch (error: any) {
      toast({ title: "Failed to create Round Robin", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfigDialog = (config: PoolConfig) => {
    setDeletingConfig(config);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfig = async () => {
    if (!deletingConfig) return;
    try {
      setSaving(true);
      await roundRobinApi.deleteConfig(deletingConfig.id);
      setDeleteDialogOpen(false);
      setDeletingConfig(null);
      await loadAll();
      toast({ title: "Configuration deleted" });
    } catch (error: any) {
      toast({ title: "Failed to delete configuration", description: error?.response?.data?.error || "Try again.", variant: "destructive" as any });
    } finally {
      setSaving(false);
    }
  };

  const getMemberCount = (poolType: string) => {
    return (members[poolType] || []).filter((m) => m.isActive).length;
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <a href="/setup" className="hover:underline">Setup</a>
          <span>/</span>
          <a href="/setup/customization" className="hover:underline">Customization</a>
          <span>/</span>
          <span>Round Robin</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Round Robin Configuration
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure automatic lead assignment pools for your teams.
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Round Robin
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading configuration...</div>
        </div>
      ) : configs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No Round Robin configurations found.</p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create First Configuration
          </Button>
        </div>
      ) : (
        <div className="grid gap-6">
          {configs.map((config) => (
            <Card key={config.poolType}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {config.name}
                    <Badge variant="secondary">{getMemberCount(config.poolType)} members</Badge>
                  </CardTitle>
                  <CardDescription>
                    {config.description || `Pool type: ${config.poolType} · Profile: ${config.profileName}`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => openAddDialog(config.poolType)}>
                    <UserPlus className="h-4 w-4 mr-1" />
                    Add User
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDeleteConfigDialog(config)}
                    className="text-destructive hover:text-destructive"
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(members[config.poolType] || []).length === 0 ? (
                  <div className="flex items-center gap-2 py-6 text-muted-foreground justify-center">
                    <AlertTriangle className="h-4 w-4" />
                    No eligible members — new Leads will be assigned to Admin.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Profile</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[80px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(members[config.poolType] || []).map((member) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">
                            {member.user.firstName} {member.user.lastName}
                          </TableCell>
                          <TableCell>{member.user.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{member.user.profile?.name || "No Profile"}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={member.user.isActive ? "default" : "destructive"}>
                              {member.user.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openRemoveDialog(member)}
                              className="text-destructive hover:text-destructive"
                            >
                              <UserMinus className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Round Robin Configuration</DialogTitle>
            <DialogDescription>
              Create a new Round Robin pool for automatic lead assignment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Pool Type</Label>
              <Input
                placeholder="e.g. RECOVERY, MARKETING"
                value={newConfig.poolType}
                onChange={(e) => setNewConfig({ ...newConfig, poolType: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })}
              />
              <p className="text-xs text-muted-foreground">Uppercase alphanumeric. Must not duplicate an existing pool type.</p>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Recovery Round Robin"
                value={newConfig.name}
                onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                placeholder="What this pool does"
                value={newConfig.description}
                onChange={(e) => setNewConfig({ ...newConfig, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Profile</Label>
              <Select value={newConfig.profileName} onValueChange={(v) => setNewConfig({ ...newConfig, profileName: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a profile for eligible users" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_PROFILES.map((p) => (
                    <SelectItem key={p.name} value={p.name}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Users with this profile will be eligible for this pool.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateConfig} disabled={!newConfig.poolType || !newConfig.name || !newConfig.profileName || saving}>
              {saving ? "Creating..." : "Create Round Robin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to {configs.find((c) => c.poolType === selectedPool)?.name || selectedPool}</DialogTitle>
            <DialogDescription>
              Select an eligible user to add to this Round Robin pool.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {eligibleUsers.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                No eligible users available for this pool.
              </div>
            ) : (
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.firstName} {user.lastName} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!selectedUserId || saving}>
              {saving ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from Round Robin</DialogTitle>
            <DialogDescription>
              Remove {removingMember?.user.firstName} {removingMember?.user.lastName} from this pool?
              Existing leads owned by this user will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={saving}>
              {saving ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Round Robin</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this Round Robin? Its members will be removed from this pool, while CRM users and historical assignments remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfig} disabled={saving}>
              {saving ? "Deleting..." : "Delete Round Robin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

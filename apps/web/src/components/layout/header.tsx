"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, Bell, Menu, Settings, LogOut, User, HelpCircle, ChevronDown, Check } from "lucide-react";
import { SearchDialog } from "@/components/crm/search-dialog";
import { useAuth } from "@/contexts/auth-context";
import { homepageApi, profileApi } from "@/lib/api";

interface HeaderProps {
  onMenuClick: () => void;
}

function slugifyProfileName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profile, logout, isAdmin, isSuperAdmin } = useAuth();
  const isAuthenticated = Boolean(user);
  const showHomeSelector = isAuthenticated;
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [adminHomeOpen, setAdminHomeOpen] = React.useState(false);
  const [adminProfiles, setAdminProfiles] = React.useState<{ id: string; name: string }[]>([]);
  const [adminHomepages, setAdminHomepages] = React.useState<{ id: string; name: string }[]>([]);
  const [notifications] = React.useState([
    { id: 1, title: "New lead assigned", time: "5 min ago", read: false },
    { id: 2, title: "Site visit scheduled", time: "1 hour ago", read: false },
    { id: 3, title: "Payment received", time: "2 hours ago", read: true },
  ]);

  const refreshAdminDropdownData = React.useCallback(() => {
    if (!user) {
      setAdminProfiles([]);
      setAdminHomepages([]);
      return;
    }

    let isMounted = true;
    const profilesRequest = isAdmin ? profileApi.list() : Promise.resolve({ data: [] });
    const homepagesRequest = isAdmin ? homepageApi.list() : homepageApi.assigned();
    Promise.all([profilesRequest, homepagesRequest])
      .then(([profilesResponse, homepagesResponse]) => {
        const profileItems = (Array.isArray(profilesResponse.data)
          ? profilesResponse.data
          : (profilesResponse.data as any)?.data ?? (profilesResponse.data as any)?.profiles ?? []) as Array<{ id?: string; name?: string }>;
        const homepageResponseData = (homepagesResponse.data as any)?.data;
        const homepageItems = (Array.isArray(homepagesResponse.data)
          ? homepagesResponse.data
          : Array.isArray(homepageResponseData)
            ? homepageResponseData
            : homepageResponseData
              ? [homepageResponseData]
              : (homepagesResponse.data as any)?.homepages ?? []) as Array<{ id?: string; name?: string }>;

        const uniqueProfiles: Array<{ id: string; name: string }> = Array.from(
          new Map(
            profileItems
              .filter((item) => !!item?.name)
              .map((item) => [item.id as string, { id: item.id || "", name: item.name as string }])
          ).values()
        ).sort((a, b) => a.name.localeCompare(b.name));
        const uniqueHomepages: Array<{ id: string; name: string }> = Array.from(
          new Map(
            homepageItems
              .filter((item) => !!item?.name)
              .map((item) => [item.id as string, { id: item.id || "", name: item.name as string }])
          ).values()
        ).sort((a, b) => a.name.localeCompare(b.name));

        if (isMounted) {
          setAdminProfiles(uniqueProfiles);
          setAdminHomepages(uniqueHomepages);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAdminProfiles([]);
          setAdminHomepages([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isAdmin, isAuthenticated]);

  React.useEffect(() => {
    refreshAdminDropdownData();
  }, [refreshAdminDropdownData]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const userInitials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U"
    : "U";

  const userName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User"
    : "User";

  const selectedHomepageId = pathname === "/home"
    ? searchParams.get("homepage")
    : null;
  const selectedHomepage = adminHomepages.find(
    (homepage) => homepage.id === selectedHomepageId,
  );
  const isAdminHomeSelected = pathname === "/home" && !selectedHomepageId;
  const selectedHomeLabel = selectedHomepage?.name || "Admin Home";

  const handleLogout = async () => {
    await logout();
  };

  const handleProfileNavigation = (profileName: string) => {
    setAdminHomeOpen(false);
    router.push(`/profiles/${slugifyProfileName(profileName)}`);
  };

  const handleHomepageNavigation = (homepageId: string) => {
    setAdminHomeOpen(false);
    router.push(`/home?homepage=${encodeURIComponent(homepageId)}`);
  };

  const handleAdminHomeNavigation = () => {
    setAdminHomeOpen(false);
    router.push("/home");
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-muted-foreground md:w-80"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
            <span className="truncate">Search leads, opportunities, tasks...</span>
          </Button>
        </div>
        <div className="flex items-center gap-1">
          {showHomeSelector && (
            <DropdownMenu
              modal={false}
              open={adminHomeOpen}
              onOpenChange={(isOpen) => {
                setAdminHomeOpen(isOpen);
                if (isOpen) {
                  refreshAdminDropdownData();
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-9 border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm"
                >
                  <span className="max-w-48 truncate">{selectedHomeLabel}</span>
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  onSelect={handleAdminHomeNavigation}
                  className={cn(
                    "font-medium",
                    isAdminHomeSelected && "bg-accent",
                  )}
                >
                  <Check className={cn("mr-2 h-4 w-4", !isAdminHomeSelected && "invisible")} />
                  Admin Home
                </DropdownMenuItem>
                {adminProfiles.map((profileItem) => (
                  <DropdownMenuItem
                    key={`profile-${profileItem.id}`}
                    onSelect={() => handleProfileNavigation(profileItem.name)}
                    className="text-sm"
                  >
                    {profileItem.name}
                  </DropdownMenuItem>
                ))}
                {adminProfiles.length > 0 && adminHomepages.length > 0 && <DropdownMenuSeparator />}
                {adminHomepages.map((homepage) => (
                  <DropdownMenuItem
                    key={homepage.id}
                    onSelect={() => handleHomepageNavigation(homepage.id)}
                    className={cn(
                      "text-sm",
                      selectedHomepageId === homepage.id && "bg-accent font-medium",
                    )}
                  >
                    <Check className={cn("mr-2 h-4 w-4", selectedHomepageId !== homepage.id && "invisible")} />
                    {homepage.name}
                  </DropdownMenuItem>
                ))}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Customize Home page</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem
                          onSelect={() => {
                            setAdminHomeOpen(false);
                            router.push("/admin/customize-home");
                          }}
                        >
                          Standard
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] leading-none"
                  >
                    {unreadCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.map((notification) => (
                <DropdownMenuItem key={notification.id} className="flex flex-col items-start gap-0.5">
                  <span className={cn("text-[13px]", !notification.read && "font-medium")}>
                    {notification.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{notification.time}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <HelpCircle className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.open("https://dctcrm.com/help", "_blank")}>
                Help Center
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("https://dctcrm.com/docs", "_blank")}>
                Documentation
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("mailto:support@dctcrm.com")}>
                Contact Support
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.avatar || ""} alt={userName} />
                  <AvatarFallback>{userInitials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-[13px] font-medium">{userName}</p>
                  <p className="text-[11px] text-muted-foreground">{user?.email || ""}</p>
                  {profile && (
                    <Badge variant="secondary" className="mt-1 w-fit">
                      {profile.name}
                    </Badge>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isSuperAdmin && (
                <>
                  <DropdownMenuItem onClick={() => router.push("/admin/users")}>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/admin")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {!isSuperAdmin && isAdmin && (
                <>
                  <DropdownMenuItem onClick={() => router.push("/setup/general/users")}>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/setup")}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

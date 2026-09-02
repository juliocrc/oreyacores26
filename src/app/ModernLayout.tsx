"use client";
import CommandPalette from "@/components/CommandPalette";
import * as React from "react";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import AppBar from "@mui/material/AppBar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Link from "next/link";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { APP_CONFIG } from "@/lib/app-config";
import { APP_TOAST_EVENT, type AppToastPayload } from "@/lib/app-toast";
import { canonicalizePermissionPathPrefix } from "@/lib/permission-access";
import { getAccessRoleLabel, hasElevatedAccess } from "@/lib/permission-access";
import { LEGACY_OT_CREATION_ROUTE, OT_CREATION_ROUTE } from "@/lib/permissions-catalog";
import { getServiceStationProfile } from "@/lib/service-station-profile";
import { AppThemeName } from "@/theme";
import GlobalSearch from "@/components/GlobalSearch";
import OfflineSyncButton from "@/components/OfflineSyncButton";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { useAppThemeController } from "./providers";

const drawerWidth = 244;
const tabletDrawerWidth = 216;
const collapsedDrawerWidth = 72;
const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

type NavItem = {
  label: string;
  href: string;
  icon?: string;
  description?: string;
  roles?: Array<"ADMIN" | "USER" | "CLIENTE">;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

type LoginAlertEvent = {
  sessionId: string;
  userId: number;
  email: string;
  name?: string | null;
  createdAt: string;
  lastPath?: string;
};

const navSections: NavSection[] = [
  {
    label: "Operação",
    items: [
      { label: "Agenda", href: "/agenda", icon: "🗓️", roles: ["ADMIN"] },
      { label: "Estação de Serviço", href: "/estacao-servico", icon: "🏭", roles: APP_CONFIG.theme === 'deluxe' ? ["ADMIN", "USER"] : ["ADMIN"] },
      { label: "Oficina & Calibração", href: "/oficina", icon: "🛠️", roles: ["ADMIN", "USER"] },
      { label: "Logística", href: "/logistica", icon: "🚚", roles: ["ADMIN"] },
      { label: "Check-In/Out Cais", href: "/cais", icon: "⚓", roles: ["ADMIN", "USER"] },
      { label: "Alertas", href: "/alertas", icon: "🚨", roles: ["ADMIN", "USER"] },
      { label: "Pedidos de Assistência", href: "/pedidos-assistencia", icon: "📩", roles: ["ADMIN", "USER"] },
      { label: "Backups", href: "/backups", icon: "💾", roles: ["ADMIN"] },
    ],
  },
  {
    label: "Ordens de Serviço",
    items: [
      { label: "Criar OT", href: "/criar-ot", icon: "📝", roles: ["ADMIN", "USER"] },
      { label: "Ordens de Serviço", href: "/ordens-servico", icon: "📋", roles: ["ADMIN", "USER"] },
      { label: "Portal (vista cliente)", href: "/portal/ordens-servico", icon: "👁️", roles: ["ADMIN", "USER"] },
      { label: "Orçamentos", href: "/orcamentos", icon: "🧮", roles: ["ADMIN", "USER"] },
    ],
  },
  {
    label: "Comercial & Faturação",
    items: [
      { label: "Faturação", href: "/faturacao", icon: "💳", roles: ["ADMIN", "USER"] },
      { label: "Cobranças", href: "/cobrancas", icon: "💰", roles: ["ADMIN", "USER"] },
      { label: "Contas a Receber", href: "/contas-receber", icon: "📊", roles: ["ADMIN"] },
      { label: "Relatório de Validades", href: "/relatorio-validades", icon: "📅", roles: ["ADMIN", "USER"] },
    ],
  },
  {
    label: "Frota e Equipamento",
    items: [
      { label: "Jangadas", href: "/jangadas", icon: "🛶", roles: ["ADMIN", "USER"] },
      { label: "Estado Jangada", href: "/estado-jangada", icon: "🛟", roles: ["ADMIN", "USER"] },
      { label: "Inspeções", href: "/inspecoes", icon: "🔍", roles: ["ADMIN", "USER"] },
      { label: "Packs", href: "/packs", icon: "🎒", roles: ["ADMIN", "USER"] },
      { label: "Navios", href: "/navios", icon: "🚢", roles: ["ADMIN"] },
      { label: "EPIRBs", href: "/epirbs", icon: "📡", roles: ["ADMIN"] },
      { label: "Coletes", href: "/equipamentos", icon: "🦺", roles: ["ADMIN"] },
      { label: "Fatos de Imersão", href: "/fatos-imersao", icon: "🧥", roles: ["ADMIN"] },
      { label: "Cilindros", href: "/cilindros", icon: "🫙", roles: ["ADMIN"] },
      { label: "Extintores", href: "/extintores", icon: "🧯", roles: ["ADMIN"] },
    ],
  },
  {
    label: "Stock",
    items: [
      { label: "Stock", href: "/stock", icon: "📦", roles: ["ADMIN"] },
      { label: "Reposições", href: "/stock/reposicoes", icon: "🔁", roles: ["ADMIN"] },
    ],
  },
  {
    label: "Clientes",
    items: [
      { label: "Clientes", href: "/clientes", icon: "👥", roles: ["ADMIN"] },
      { label: "Técnicos", href: "/tecnicos", icon: "🧑‍🔧", roles: ["ADMIN"] },
      { label: "Comunicações", href: "/comunicacoes", icon: "📨", roles: ["ADMIN"] },
      { label: "WhatsApp", href: "/whatsapp", icon: "💬", roles: ["ADMIN"] },
    ],
  },
  {
    label: "Documentação & Qualidade",
    items: [
      { label: "Qualidade de Dados", href: "/qualidade-dados", icon: "✅", roles: ["ADMIN"] },
      { label: "Conformidade DGRM", href: "/dgrm", icon: "📄", roles: ["ADMIN"] },
      { label: "Auditorias", href: "/auditorias", icon: "🔎", roles: ["ADMIN"] },
      { label: "Departamento Técnico", href: "/departamento-tecnico", icon: "🧠", roles: ["ADMIN"] },
      { label: "Legislação", href: "/legislacao", icon: "⚖️", roles: ["ADMIN"] },
      { label: "Certificados Externos", href: "/fotos", icon: "📑", roles: ["ADMIN"] },
      { label: "Relatórios", href: "/relatorios", icon: "📈", roles: ["ADMIN"] },
      { label: "Contactos Internos", href: "/contactos-internos", icon: "☎️", roles: ["ADMIN"] },
    ],
  },
  {
    label: "Administração",
    items: [
      { label: "Utilizadores", href: "/utilizadores", icon: "👤", roles: ["ADMIN"] },
      { label: "Registar", href: "/registar", icon: "➕", roles: ["ADMIN"] },
    ],
  },
];

function isNavItemActive(pathname: string, href: string) {
  const normalizedPathname = canonicalizePermissionPathPrefix(pathname);
  const normalizedHref = canonicalizePermissionPathPrefix(href);

  if (normalizedHref === "/") {
    return normalizedPathname === "/";
  }

  if (normalizedHref === "/stock" && (normalizedPathname.startsWith("/stock/reposicoes") || normalizedPathname.startsWith("/stock/previsao"))) {
    return false;
  }

  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
}

function pathMatchesPrefix(pathname: string, prefix: string) {
  const normalizedPathname = canonicalizePermissionPathPrefix(pathname);
  const normalizedPrefix = canonicalizePermissionPathPrefix(prefix);

  if (normalizedPrefix === "/") return normalizedPathname === "/";
  return normalizedPathname === normalizedPrefix || normalizedPathname.startsWith(`${normalizedPrefix}/`);
}

function subscribeOnlineStatus(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getOnlineStatusSnapshot() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function getOnlineStatusServerSnapshot() {
  return true;
}

function subscribeNothing() {
  return () => undefined;
}

export default function ModernLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"; } catch { return false; }
  });
  const [accountAnchorEl, setAccountAnchorEl] = React.useState<null | HTMLElement>(null);
  const [activeStationCode, setActiveStationCode] = React.useState<string | null>(null);
  const [assistenciaPendentes, setAssistenciaPendentes] = React.useState(0);
  const [loginAlertsQueue, setLoginAlertsQueue] = React.useState<LoginAlertEvent[]>([]);
  const [appToastQueue, setAppToastQueue] = React.useState<AppToastPayload[]>([]);
  const mounted = React.useSyncExternalStore(subscribeNothing, () => true, () => false);
  const isOnline = React.useSyncExternalStore(subscribeOnlineStatus, getOnlineStatusSnapshot, getOnlineStatusServerSnapshot);
  const activeLoginAlert = loginAlertsQueue[0] ?? null;
  const activeAppToast = appToastQueue[0] ?? null;
  const loginAlertSeenRef = React.useRef<Set<string>>(new Set());
  const loginAlertInitializedRef = React.useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const canRenderInteractiveHeader = mounted;
  const { themeName, setThemeName, themeOptions } = useAppThemeController();

  const isLoginPage = pathname === "/login";
  const isAreaClientePage = pathname === "/area-cliente";
  const isStandalonePage = isLoginPage || isAreaClientePage || pathname.startsWith("/estado-jangada");
  const user = session?.user;
  const userInitial = user?.name?.trim()?.charAt(0)?.toUpperCase() || user?.email?.trim()?.charAt(0)?.toUpperCase() || "U";
  const userRole = user?.role === "ADMIN" ? "ADMIN" : user?.role === "CLIENTE" ? "CLIENTE" : "USER";
  const userIsAdmin = user?.role === "ADMIN";
  const hasElevatedUserAccess = hasElevatedAccess({ role: user?.role, permissions: user?.permissions });
  const userAccessLabel = getAccessRoleLabel({ role: user?.role, permissions: user?.permissions });
  const stationProfile = React.useMemo(() => getServiceStationProfile(activeStationCode), [activeStationCode]);
  const hiddenModuleKeys = React.useMemo(() => new Set(stationProfile.hiddenModuleKeys), [stationProfile]);
  const visibleModuleKeys = new Set<string>(Array.isArray(user?.permissions?.visibleModules) ? user.permissions.visibleModules : []);
  const visiblePagePrefixes = Array.isArray(user?.permissions?.visiblePages) ? user.permissions.visiblePages.map((item) => String(item)) : [];
  const moduleKeyByHref: Record<string, string> = {
    "/": "dashboard",

    "/agenda": "agenda",
    "/estacao-servico": "estacao-servico",
    "/oficina": "oficina",
    "/logistica": "logistica",
    "/alertas": "alertas",
    "/pedidos-assistencia": "pedidos-assistencia",
    "/inspecoes": "jangadas",

    "/relatorios": "relatorios",
    "/jangadas": "jangadas",
    "/packs": "packs",
    "/navios": "navios",
    "/epirbs": "epirbs",
    "/clientes": "clientes",
    "/tecnicos": "tecnicos",
    "/comunicacoes": "comunicacoes",
    "/whatsapp": "whatsapp",
    "/equipamentos": "equipamentos",
    "/fatos-imersao": "fatos-imersao",
    "/stock": "stock",
    "/stock/reposicoes": "stock",
    "/stock/previsao": "stock",
    "/cilindros": "cilindros",
    "/extintores": "equipamentos",
    [OT_CREATION_ROUTE]: "obras",
    [LEGACY_OT_CREATION_ROUTE]: "obras",
    "/departamento-tecnico": "departamento-tecnico",
    "/dgrm": "dgrm",
    "/auditorias": "auditorias",
    "/fotos": "fotos",
    "/contactos-internos": "contactos-internos",
    "/legislacao": "legislacao",
    "/utilizadores": "utilizadores",
    "/registar": "registar",
    "/backups": "backups",
  };

  const visibleNavSections = navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => {
            const key = moduleKeyByHref[item.href] || item.href;
            if (hiddenModuleKeys.has(key)) return false;
            const explicitlyGranted = visibleModuleKeys.has(key) || visiblePagePrefixes.some((prefix) => pathMatchesPrefix(item.href, prefix));

            if (userIsAdmin) return true;

            const hasOverrides = visibleModuleKeys.size > 0 || visiblePagePrefixes.length > 0;
            if (hasOverrides && !explicitlyGranted) return false;
            if (explicitlyGranted) return true;
            if (hasOverrides) return false;
            if (item.roles && !item.roles.includes(userRole)) return false;
            return true;
          }),
        }))
        .filter((section) => section.items.length > 0);

  React.useEffect(() => {
    if (!mounted || !user) return;
    let active = true;

    fetch("/api/active-service-station", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        setActiveStationCode(payload?.activeStation?.codigo || null);
      })
      .catch(() => {
        if (!active) return;
        setActiveStationCode(null);
      });

    return () => {
      active = false;
    };
  }, [mounted, user]);

  React.useEffect(() => {
    if (!mounted || !userIsAdmin) return;
    let active = true;

    const loadPendentes = () => {
      fetch("/api/pedidos-assistencia?estado=novo&limite=1", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return { count: 0 };
          return response.json();
        })
        .then((payload) => {
          if (!active) return;
          setAssistenciaPendentes(typeof payload?.count === "number" ? payload.count : 0);
        })
        .catch(() => {
          if (active) setAssistenciaPendentes(0);
        });
    };

    loadPendentes();
    const interval = window.setInterval(loadPendentes, 60_000);
    const onFocus = () => loadPendentes();
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [mounted, userIsAdmin]);

  React.useEffect(() => {
    if (!mounted || !user || !hasElevatedUserAccess) return;

    const storageKey = `admin-login-alert-seen:${user.id}`;
    let active = true;

    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        loginAlertSeenRef.current = new Set(parsed.map((item) => String(item || "")).filter(Boolean));
      }
    } catch {
      loginAlertSeenRef.current = new Set();
    }

    const saveSeenIds = () => {
      try {
        const ids = Array.from(loginAlertSeenRef.current).slice(-400);
        window.localStorage.setItem(storageKey, JSON.stringify(ids));
      } catch {
        // no-op
      }
    };

    const pollLoginAlerts = async () => {
      try {
        const response = await fetch("/api/user/presence?sinceMinutes=45", { cache: "no-store" });
        if (!response.ok) return;

        const payload = await response.json();
        const events = Array.isArray(payload?.events) ? (payload.events as LoginAlertEvent[]) : [];
        if (!active || events.length === 0) return;

        if (!loginAlertInitializedRef.current) {
          events.forEach((event) => {
            if (event?.sessionId) loginAlertSeenRef.current.add(String(event.sessionId));
          });
          loginAlertInitializedRef.current = true;
          saveSeenIds();
          return;
        }

        const currentUserId = Number(user.id);
        const fresh = [...events]
          .reverse()
          .filter((event) => {
            const sessionId = String(event?.sessionId || "");
            if (!sessionId) return false;
            if (Number(event.userId) === currentUserId) {
              loginAlertSeenRef.current.add(sessionId);
              return false;
            }
            if (loginAlertSeenRef.current.has(sessionId)) return false;
            loginAlertSeenRef.current.add(sessionId);
            return true;
          });

        if (fresh.length > 0) {
          setLoginAlertsQueue((prev) => [...prev, ...fresh]);
          saveSeenIds();
        }
      } catch {
        // no-op
      }
    };

    void pollLoginAlerts();
    const intervalId = window.setInterval(() => {
      void pollLoginAlerts();
    }, 20_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [mounted, user, hasElevatedUserAccess]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const handleAppToast = (event: Event) => {
      const customEvent = event as CustomEvent<AppToastPayload>;
      const payload = customEvent.detail;
      if (!payload?.message) return;
      setAppToastQueue((prev) => [...prev, payload]);
    };

    window.addEventListener(APP_TOAST_EVENT, handleAppToast as EventListener);
    return () => {
      window.removeEventListener(APP_TOAST_EVENT, handleAppToast as EventListener);
    };
  }, []);

  const dismissAppToast = () => {
    setAppToastQueue((prev) => prev.slice(1));
  };

  const dismissLoginAlert = () => {
    setLoginAlertsQueue((prev) => prev.slice(1));
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const effectiveDrawerWidth = sidebarCollapsed ? collapsedDrawerWidth : { md: tabletDrawerWidth, lg: drawerWidth };
  const mainWidth = isStandalonePage ? "100%" : sidebarCollapsed
    ? `calc(100% - ${collapsedDrawerWidth}px)`
    : { md: `calc(100% - ${tabletDrawerWidth}px)`, lg: `calc(100% - ${drawerWidth}px)` };



  const handleAccountMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAccountAnchorEl(event.currentTarget);
  };

  const handleAccountMenuClose = () => {
    setAccountAnchorEl(null);
  };

  const handleLogout = async () => {
    handleAccountMenuClose();
    await fetch("/api/user/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathname, offline: true }),
      keepalive: true,
    }).catch(() => undefined);
    await signOut({ callbackUrl: "/login" });
  };

  const drawer = (
    <div style={{ transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}>
      <Toolbar sx={{ minHeight: { xs: 64 } }}>
        {sidebarCollapsed ? (
          <Box sx={{ display: "flex", justifyContent: "center", width: "100%" }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main", fontSize: 16 }}>⚓</Avatar>
          </Box>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
            <Avatar sx={{ width: 30, height: 30, bgcolor: "primary.main", fontSize: 16 }}>⚓</Avatar>
            <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
              {APP_CONFIG.name}
            </Typography>
          </Box>
        )}
        <IconButton
          onClick={toggleSidebarCollapsed}
          size="small"
          sx={{
            display: { xs: "none", md: "flex" },
            color: "text.secondary",
            bgcolor: "action.hover",
            "&:hover": { bgcolor: "action.selected" },
            width: 28,
            height: 28,
          }}
          title={sidebarCollapsed ? "Expandir sidebar" : "Recolher sidebar"}
        >
          <Typography sx={{ fontSize: 14, transition: "transform 0.25s", transform: sidebarCollapsed ? "rotate(180deg)" : "none" }}>◀</Typography>
        </IconButton>
      </Toolbar>
      <Divider />
      <Box sx={{ px: sidebarCollapsed ? 0.5 : 1.25, py: 1.5, overflowY: "auto", overflowX: "hidden" }}>
        {visibleNavSections.map((section, sectionIndex) => (
          <Box
            key={section.label}
            sx={{
              mb: sectionIndex === visibleNavSections.length - 1 ? 0 : 1.5,
              border: sidebarCollapsed ? "none" : "1px solid",
              borderColor: "divider",
              bgcolor: sidebarCollapsed ? "transparent" : "rgba(248,250,252,0.8)",
              borderRadius: 2,
              px: sidebarCollapsed ? 0 : 0.75,
              py: 0.75,
            }}
          >
            {!sidebarCollapsed && (
              <Typography
                variant="caption"
                sx={{
                  px: 1.5,
                  pb: 0.75,
                  display: "block",
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: "text.secondary",
                }}
              >
                {section.label}
              </Typography>
            )}
            <List disablePadding>
              {section.items.map((item) => {
                const active = isNavItemActive(pathname, item.href);

                return (
                  <ListItem key={item.label} disablePadding sx={{ mb: sidebarCollapsed ? 0.25 : 0.5 }}>
                    <ListItemButton
                      onClick={() => {
                        router.push(item.href);
                        setMobileOpen(false);
                      }}
                      selected={active}
                      title={sidebarCollapsed ? item.label : undefined}
                      sx={{
                        borderRadius: 2,
                        px: sidebarCollapsed ? 0 : 1.75,
                        py: sidebarCollapsed ? 1 : 1,
                        justifyContent: sidebarCollapsed ? "center" : "flex-start",
                        minWidth: sidebarCollapsed ? 44 : undefined,
                        border: "1px solid transparent",
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                        '&.Mui-selected': {
                            bgcolor: 'rgba(59, 130, 246, 0.16)',
                            color: 'primary.main',
                            borderColor: 'rgba(59, 130, 246, 0.24)',
                        },
                        '&.Mui-selected:hover': {
                            bgcolor: 'rgba(59, 130, 246, 0.22)',
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: sidebarCollapsed ? 0 : 34, color: active ? 'primary.main' : 'text.secondary', justifyContent: "center" }}>
                        <Typography component="span" sx={{ fontSize: sidebarCollapsed ? 18 : 15.5, lineHeight: 1 }}>{item.icon || "•"}</Typography>
                      </ListItemIcon>
                      {!sidebarCollapsed && (
                        <ListItemText
                          primary={item.label}
                          primaryTypographyProps={{
                            fontSize: 14.5,
                            fontWeight: active ? 700 : 500,
                            color: 'text.primary',
                          }}
                        />
                      )}
                      {!sidebarCollapsed && item.href === "/pedidos-assistencia" && assistenciaPendentes > 0 && (
                        <Box
                          component="span"
                          sx={{
                            bgcolor: "error.main",
                            color: "#fff",
                            borderRadius: 999,
                            px: 1,
                            py: 0.25,
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1.4,
                            ml: 1,
                          }}
                        >
                          {assistenciaPendentes > 99 ? "99+" : assistenciaPendentes}
                        </Box>
                      )}
                      {sidebarCollapsed && item.href === "/pedidos-assistencia" && assistenciaPendentes > 0 && (
                        <Box
                          component="span"
                          sx={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            bgcolor: "error.main",
                            color: "#fff",
                            borderRadius: "50%",
                            width: 16,
                            height: 16,
                            fontSize: 9,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {assistenciaPendentes > 99 ? "99" : assistenciaPendentes}
                        </Box>
                      )}
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>
      {!sidebarCollapsed && (
        <Box sx={{ px: 2, py: 1.5, mt: 1 }}>
          <Button
            component={Link}
            href="/ordens-servico?openRequest=true"
            variant="contained"
            fullWidth
            sx={{
              borderRadius: 3,
              py: 1.25,
              fontWeight: 800,
              fontSize: "13px",
              textTransform: "none",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.2)",
              bgcolor: "#2563eb",
              color: "white",
              "&:hover": {
                bgcolor: "#1d4ed8",
              },
            }}
          >
            Pedir Assistência / Inspeção
          </Button>
        </Box>
      )}
    </div>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: "primary.main",
          backgroundImage: (theme) => `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        }}
      >
        <Toolbar>
          {!isStandalonePage && <IconButton color="inherit" aria-label="open drawer" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2, display: { md: "none" } }}>
            <MenuIcon />
          </IconButton>}
          <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 800, letterSpacing: "-0.02em", textShadow: "0 1px 0 rgba(15,23,42,0.22)", display: "flex", alignItems: "center", gap: 1 }}>
            {APP_CONFIG.name}
            {mounted && isOnline && (
              <Box
                component="span"
                title="Online"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: "#22c55e",
                  display: "inline-block",
                  boxShadow: "0 0 6px rgba(34, 197, 94, 0.6)",
                  animation: "pulse-green 2s ease-in-out infinite",
                }}
              />
            )}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            component={Link}
            href="/ordens-servico?openRequest=true"
            variant="contained"
            sx={{
              mr: 2,
              borderRadius: "999px",
              bgcolor: "#e11d48",
              color: "white",
              fontWeight: 800,
              fontSize: "12px",
              textTransform: "none",
              px: 2,
              py: 0.75,
              boxShadow: "0 2px 8px rgba(225, 29, 72, 0.3)",
              "&:hover": {
                bgcolor: "#be123c",
              },
              display: { xs: "flex", sm: "flex" },
            }}
          >
            Pedir Assistência
          </Button>
          {!isStandalonePage && canRenderInteractiveHeader ? <OfflineSyncButton /> : null}
          {!isStandalonePage && canRenderInteractiveHeader ? <GlobalSearch showTrigger /> : null}
          {!isStandalonePage && canRenderInteractiveHeader ? (
            <FormControl
              size="small"
              sx={{
                minWidth: 165,
                mr: 1.5,
                display: { xs: "none", lg: "block" },
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  borderRadius: 999,
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.4)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.65)' },
                  '&.Mui-focused fieldset': { borderColor: '#fff' },
                },
                '& .MuiSvgIcon-root': { color: '#fff' },
              }}
            >
              <Select
                native
                value={themeName}
                onChange={(event) => setThemeName(event.target.value as AppThemeName)}
                inputProps={{ 'aria-label': 'Selecionar tema visual' }}
              >
                {themeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormControl>
          ) : null}
          {!canRenderInteractiveHeader ? null : status === "loading" ? (
            <CircularProgress size={22} sx={{ color: "white" }} />
          ) : user ? (
            <>
              <Button color="inherit" onClick={handleAccountMenuOpen} startIcon={<Avatar src={user.image || undefined} sx={{ width: 32, height: 32 }}>{userInitial}</Avatar>} sx={{ textTransform: "none", borderRadius: 999, px: 1.5 }} suppressHydrationWarning>
                <Stack spacing={0} sx={{ alignItems: "flex-start", display: { xs: "none", md: "flex" } }}>
                  <span className="text-sm font-semibold leading-tight">{user.name || user.email}</span>
                  <span className="text-[11px] leading-tight opacity-90">{userAccessLabel}</span>
                </Stack>
              </Button>
              <Menu anchorEl={accountAnchorEl} open={Boolean(accountAnchorEl)} onClose={handleAccountMenuClose} anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
                <MenuItem disabled>{user.email}</MenuItem>
                <MenuItem disabled>{userAccessLabel}</MenuItem>
                <Divider />
                <MenuItem onClick={handleLogout}>Terminar sessão</MenuItem>
              </Menu>
            </>
          ) : !isStandalonePage ? (
            <Button
              color="inherit"
              variant="outlined"
              component={Link}
              href="/login"
              sx={{ borderColor: "rgba(255,255,255,0.5)", color: "white", textTransform: "none", '&:hover': { borderColor: "white", bgcolor: "rgba(255,255,255,0.08)" } }}
            >
              Entrar
            </Button>
          ) : null}
        </Toolbar>
      </AppBar>
      {/* Offline connectivity banner */}
      {mounted && !isOnline && (
        <Box
          sx={{
            position: "fixed",
            top: 64,
            left: isStandalonePage ? 0 : sidebarCollapsed ? `${collapsedDrawerWidth}px` : { md: `${tabletDrawerWidth}px`, lg: `${drawerWidth}px` },
            right: 0,
            zIndex: (theme) => theme.zIndex.drawer + 2,
            bgcolor: "#f59e0b",
            color: "#78350f",
            px: 2,
            py: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            fontSize: 13,
            fontWeight: 700,
            boxShadow: "0 2px 8px rgba(245, 158, 11, 0.3)",
          }}
        >
          <Box component="span" sx={{ fontSize: 16 }}>⚠️</Box>
          Modo Offline — os dados serão sincronizados quando voltar a estar online
        </Box>
      )}
      {!isStandalonePage && <Box component="nav" sx={{ width: effectiveDrawerWidth, flexShrink: { md: 0 }, transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }} aria-label="menu principal">
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth } }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: effectiveDrawerWidth,
              transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              overflowX: "hidden",
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>}
      <Box component="main" sx={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0, px: { xs: 1.5, sm: 2, md: 2.5, lg: 3.5 }, py: { xs: 2, sm: 3 }, pb: { xs: 10, sm: 10 }, width: mainWidth, transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}>
        <Toolbar />
        <Box sx={{ flexGrow: 1, minHeight: 0 }}>
          {children}
        </Box>
      </Box>
      <Box
        component="footer"
        sx={{
          position: "fixed",
          left: isStandalonePage ? 0 : sidebarCollapsed ? `${collapsedDrawerWidth}px` : { md: `${tabletDrawerWidth}px`, lg: `${drawerWidth}px` },
          right: 0,
          bottom: 0,
          zIndex: (theme) => theme.zIndex.appBar - 1,
          bgcolor: "background.paper",
          borderTop: "1px solid",
          borderColor: "divider",
          px: { xs: 1.5, sm: 2, md: 2.5, lg: 3.5 },
          py: 1.25,
          textAlign: "center",
          color: "primary.main",
          transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <Typography variant="body2">
          {APP_CONFIG.name} &copy; 2026
        </Typography>
      </Box>
      <Snackbar
        open={appToastQueue.length > 0}
        autoHideDuration={activeAppToast?.duration || 3500}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        onClose={dismissAppToast}
      >
        <Alert
          onClose={dismissAppToast}
          severity={activeAppToast?.severity || "info"}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {activeAppToast?.message || ""}
        </Alert>
      </Snackbar>
      <Snackbar
        open={loginAlertsQueue.length > 0}
        autoHideDuration={6500}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        onClose={dismissLoginAlert}
        sx={{ mb: appToastQueue.length > 0 ? 8 : 0 }}
      >
        <Alert onClose={dismissLoginAlert} severity="info" variant="filled" sx={{ width: "100%" }}>
          {activeLoginAlert
            ? `${activeLoginAlert.name || activeLoginAlert.email} iniciou sessão${activeLoginAlert.lastPath ? ` em ${activeLoginAlert.lastPath}` : ""}.`
            : ""}
        </Alert>
      </Snackbar>
      <CommandPalette />
      <PWAInstallBanner />
      {/* Keyframe for online indicator pulse */}
      <style>{`
        @keyframes pulse-green {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </Box>
  );
}

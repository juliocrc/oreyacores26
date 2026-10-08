"use client";
import * as React from "react";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { Wifi, WifiOff } from "lucide-react";
import {
  getForcedOfflineMode,
  setForcedOfflineMode,
  subscribeForcedOfflineMode,
} from "@/lib/offline-sync/client";

function subscribeForcedOffline(callback: () => void) {
  return subscribeForcedOfflineMode(callback);
}

function getForcedOfflineSnapshot() {
  return getForcedOfflineMode();
}

function getForcedOfflineServerSnapshot() {
  return false;
}

export default function WorkModeToggle() {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const forcedOffline = React.useSyncExternalStore(
    subscribeForcedOffline,
    getForcedOfflineSnapshot,
    getForcedOfflineServerSnapshot,
  );

  const handleSelect = (forced: boolean) => {
    setForcedOfflineMode(forced);
    setAnchorEl(null);
  };

  return (
    <>
      <Button
        color="inherit"
        size="small"
        onClick={(event) => setAnchorEl(event.currentTarget)}
        startIcon={forcedOffline ? <WifiOff size={15} /> : <Wifi size={15} />}
        sx={{
          borderRadius: 999,
          border: "1px solid",
          borderColor: forcedOffline ? "rgba(251, 191, 36, 0.55)" : "rgba(255,255,255,0.45)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "none",
          px: 1.5,
          py: 0.5,
          mr: 1,
          bgcolor: forcedOffline ? "rgba(245, 158, 11, 0.18)" : "rgba(255,255,255,0.06)",
          display: { xs: "none", sm: "inline-flex" },
          "&:hover": {
            bgcolor: forcedOffline ? "rgba(245, 158, 11, 0.28)" : "rgba(255,255,255,0.14)",
            borderColor: forcedOffline ? "rgba(251, 191, 36, 0.85)" : "rgba(255,255,255,0.8)",
          },
        }}
        title={forcedOffline ? "Modo offline ativo (operações guardadas localmente)" : "Modo online"}
      >
        {forcedOffline ? "Offline" : "Online"}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem
          selected={!forcedOffline}
          onClick={() => handleSelect(false)}
          sx={{ gap: 1, fontSize: 13 }}
        >
          <Wifi size={15} color="#16a34a" /> Modo Online
        </MenuItem>
        <MenuItem
          selected={forcedOffline}
          onClick={() => handleSelect(true)}
          sx={{ gap: 1, fontSize: 13 }}
        >
          <WifiOff size={15} color="#d97706" /> Modo Offline (local)
        </MenuItem>
      </Menu>
    </>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { getAccessRoleLabel, hasElevatedAccess } from "@/lib/permission-access";
import { formatDateTimeShort } from "@/lib/date-utils";
import { formatSessionCount } from "@/lib/utilizadores-page-helpers";
import type {
  UserPermissions,
  PermissionsCatalog,
  UserRow,
  UserFormState,
} from "@/types/utilizadores-page";
import { INITIAL_FORM } from "@/types/utilizadores-page";

interface ContactoInternoOption {
  id: number;
  nome: string;
  email: string | null;
  empresa: string | null;
  localizacao: string | null;
  categoria: string;
}

export default function UtilizadoresPage() {
  const { data: session, status, update } = useSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | "ADMIN" | "USER" | "CLIENTE">("");
  const [form, setForm] = useState<UserFormState>(INITIAL_FORM);
  const [selectedUserForm, setSelectedUserForm] = useState<UserFormState>(INITIAL_FORM);
  const [clientsList, setClientsList] = useState<{ id: number; nome: string }[]>([]);
  const [internalContacts, setInternalContacts] = useState<ContactoInternoOption[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactsError, setContactsError] = useState("");
  const [creatingFromContacts, setCreatingFromContacts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSelectedUser, setSavingSelectedUser] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [permissionDraft, setPermissionDraft] = useState<UserPermissions>({});
  const [permissionsCatalog, setPermissionsCatalog] = useState<PermissionsCatalog>({ modules: [], pages: [], editableFields: {} });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function fetchClients() {
    try {
      const res = await fetch("/api/clientes");
      if (res.ok) {
        const data = await res.json();
        setClientsList(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Erro ao buscar clientes", e);
    }
  }

  async function fetchInternalContacts() {
    setContactsError("");
    try {
      const res = await fetch("/api/contactos-internos?ativo=true");
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || "Erro ao carregar contactos internos.");
      const withEmail = (Array.isArray(data) ? data : [])
        .filter((c: ContactoInternoOption) => Boolean(c.email))
        .filter((c: ContactoInternoOption) => c.categoria?.trim().toLowerCase() !== "cliente");
      setInternalContacts(withEmail);
    } catch (err) {
      setContactsError(err instanceof Error ? err.message : "Erro ao carregar contactos internos.");
      setInternalContacts([]);
    }
  }

  const hasElevatedUserAccess = hasElevatedAccess({ role: session?.user?.role, permissions: session?.user?.permissions });

  async function fetchUsers() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("email", search.trim());
        params.set("name", search.trim());
      }
      if (roleFilter) params.set("role", roleFilter);

      const res = await fetch(`/api/user${params.toString() ? `?${params.toString()}` : ""}`);
      const payload = await res.json().catch(() => []);
      if (!res.ok) throw new Error(payload?.error || "Erro ao carregar utilizadores.");
      setUsers(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setUsers([]);
      setError(err instanceof Error ? err.message : "Erro ao carregar utilizadores.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUserPermissions(userId: string) {
    if (!userId) return;

    setLoadingPermissions(true);
    try {
      const res = await fetch(`/api/user/permissions?userId=${encodeURIComponent(userId)}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Erro ao carregar permissões.");

      setPermissionDraft((payload?.permissions || {}) as UserPermissions);
      setPermissionsCatalog((payload?.catalog || { modules: [], pages: [], editableFields: {} }) as PermissionsCatalog);
    } catch (err) {
      setPermissionDraft({});
      setPermissionsCatalog({ modules: [], pages: [], editableFields: {} });
      setError(err instanceof Error ? err.message : "Erro ao carregar permissões.");
    } finally {
      setLoadingPermissions(false);
    }
  }

  useEffect(() => {
    if (status !== "authenticated") {
      setLoading(status === "loading");
      return;
    }

    if (!hasElevatedUserAccess) {
      setLoading(false);
      setError("Apenas administradores podem consultar utilizadores.");
      return;
    }

    void fetchClients();
    void fetchInternalContacts();
    void fetchUsers();
  }, [status, hasElevatedUserAccess]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesTerm = !term
        || String(user.name || "").toLowerCase().includes(term)
        || String(user.email || "").toLowerCase().includes(term);
      const matchesRole = !roleFilter || user.role === roleFilter;
      return matchesTerm && matchesRole;
    });
  }, [users, search, roleFilter]);

  const selectedUser = useMemo(() => {
    return users.find((user) => String(user.id) === selectedUserId) || null;
  }, [users, selectedUserId]);

  const selectedUserIsSelf = useMemo(() => {
    return String(session?.user?.id || "") === String(selectedUserId || "");
  }, [session?.user?.id, selectedUserId]);

  const adminCount = useMemo(() => users.filter((user) => user.role === "ADMIN").length, [users]);
  const onlineUsers = useMemo(() => users.filter((user) => Boolean(user.isOnline)), [users]);

  const selectedUserAccessLabel = selectedUser
    ? getAccessRoleLabel({ role: selectedUser.role, permissions: selectedUser.permissions })
    : "";

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId("");
      setPermissionDraft({});
      return;
    }

    const fallbackUserId = selectedUserId && users.some((u) => String(u.id) === selectedUserId)
      ? selectedUserId
      : String(users[0].id);

    setSelectedUserId(fallbackUserId);
  }, [users]);

  useEffect(() => {
    if (!selectedUserId) return;
    void fetchUserPermissions(selectedUserId);
  }, [selectedUserId]);

  useEffect(() => {
    if (status !== "authenticated" || !hasElevatedUserAccess) return;

    const intervalId = window.setInterval(() => {
      void fetchUsers();
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [status, hasElevatedUserAccess, search, roleFilter]);

  useEffect(() => {
    if (!selectedUser) {
      setSelectedUserForm(INITIAL_FORM);
      return;
    }

    setSelectedUserForm({
      name: selectedUser.name || "",
      email: selectedUser.email || "",
      password: "",
      role: selectedUser.role,
      clienteId: selectedUser.clienteId || undefined,
    });
  }, [selectedUser]);

  const toggleStringPermission = (key: keyof UserPermissions, value: string) => {
    setPermissionDraft((prev) => {
      const current = Array.isArray(prev[key]) ? (prev[key] as string[]) : [];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return {
        ...prev,
        [key]: next,
      };
    });
  };

  const setStringPermissionValues = (key: keyof UserPermissions, values: string[]) => {
    setPermissionDraft((prev) => ({
      ...prev,
      [key]: values,
    }));
  };

  const toggleEditableField = (groupKey: string, fieldKey: string) => {
    setPermissionDraft((prev) => {
      const map = { ...(prev.editableFields || {}) };
      const current = Array.isArray(map[groupKey]) ? map[groupKey] : [];
      map[groupKey] = current.includes(fieldKey)
        ? current.filter((item) => item !== fieldKey)
        : [...current, fieldKey];

      return {
        ...prev,
        editableFields: map,
      };
    });
  };

  const setEditableFieldValues = (groupKey: string, fieldKeys: string[]) => {
    setPermissionDraft((prev) => ({
      ...prev,
      editableFields: {
        ...(prev.editableFields || {}),
        [groupKey]: fieldKeys,
      },
    }));
  };

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Erro ao criar utilizador.");

      setForm(INITIAL_FORM);
      setSuccess("Utilizador criado com sucesso.");
      await fetchUsers();
      if (payload?.id != null) {
        setSelectedUserId(String(payload.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar utilizador.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateFromContacts() {
    if (selectedContactIds.length === 0) return;

    setCreatingFromContacts(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/user/from-contactos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactoIds: selectedContactIds.map(Number) }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Erro ao criar utilizadores a partir dos contactos.");

      const createdCount = Array.isArray(payload.created) ? payload.created.length : 0;
      const duplicados = Array.isArray(payload.skippedDuplicates) ? payload.skippedDuplicates.length : 0;
      const semEmail = Array.isArray(payload.skippedNoEmail) ? payload.skippedNoEmail.length : 0;

      setSuccess(
        `${createdCount} utilizador(es) criado(s) com password ${payload.defaultPassword}. ` +
          `${duplicados} duplicado(s) ignorado(s). ${semEmail} sem email.`
      );
      setSelectedContactIds([]);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar utilizadores a partir dos contactos.");
    } finally {
      setCreatingFromContacts(false);
    }
  }

  async function handleSaveSelectedUser() {
    if (!selectedUserId) return;

    setSavingSelectedUser(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: Number(selectedUserId),
          name: selectedUserForm.name,
          email: selectedUserForm.email,
          role: selectedUserForm.role,
          password: selectedUserForm.password,
          clienteId: selectedUserForm.role === "CLIENTE" ? selectedUserForm.clienteId : null,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Erro ao guardar utilizador.");

      setSuccess("Utilizador atualizado com sucesso.");
      setSelectedUserForm((prev) => ({ ...prev, password: "" }));
      await fetchUsers();

      if (selectedUserIsSelf) {
        await update();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao guardar utilizador.");
    } finally {
      setSavingSelectedUser(false);
    }
  }

  async function handleDeleteUser(user: UserRow) {
    if (!user?.id) return;

    const confirmed = window.confirm(`Eliminar o utilizador ${user.email}? Esta ação não pode ser anulada.`);
    if (!confirmed) return;

    setDeletingUserId(String(user.id));
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(user.id) }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Erro ao eliminar utilizador.");

      setSuccess("Utilizador eliminado com sucesso.");
      if (String(user.id) === selectedUserId) {
        setSelectedUserId("");
        setPermissionDraft({});
      }
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao eliminar utilizador.");
    } finally {
      setDeletingUserId("");
    }
  }

  async function handleSavePermissions() {
    if (!selectedUserId) return;

    setSavingPermissions(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/user/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: Number(selectedUserId),
          permissions: permissionDraft,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Erro ao guardar permissões.");

      setSuccess("Permissões guardadas com sucesso.");
      await fetchUsers();

      if (String(session?.user?.id || "") === String(selectedUserId)) {
        await update();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao guardar permissões.");
    } finally {
      setSavingPermissions(false);
    }
  }

  function handleSelectAllPrivileges() {
    setPermissionDraft((prev) => ({
      ...prev,
      visibleModules: permissionsCatalog.modules.map((item) => item.key),
      visiblePages: permissionsCatalog.pages.map((item) => item.prefix),
      editablePages: permissionsCatalog.pages.map((item) => item.prefix),
      editableFields: {
        ...(prev.editableFields || {}),
        "jangadas-detail": (permissionsCatalog.editableFields?.["jangadas-detail"] || []).map((field) => field.key),
      },
    }));
  }

  function handleClearAllPrivileges() {
    setPermissionDraft((prev) => ({
      ...prev,
      visibleModules: [],
      visiblePages: [],
      editablePages: [],
      editableFields: {
        ...(prev.editableFields || {}),
        "jangadas-detail": [],
      },
    }));
  }

  if (status === "loading") {
    return <div className="min-h-screen bg-gray-50 py-8 text-center text-gray-600">A validar sessão...</div>;
  }

  if (!hasElevatedUserAccess) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
          {error || "Apenas administradores podem aceder a esta página."}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Utilizadores</h1>
            <p className="text-sm text-gray-600">Gestão de contas, privilégios e acessos operacionais num só painel.</p>
          </div>
          <div className="text-xs text-gray-500">Total carregado: {users.length}</div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Utilizadores</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{users.length}</p>
            <p className="mt-1 text-sm text-slate-500">Contas atualmente carregadas.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Administradores</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{adminCount}</p>
            <p className="mt-1 text-sm text-slate-500">Mantém pelo menos um sempre ativo.</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Online agora</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-900">{onlineUsers.length}</p>
            <p className="mt-1 text-sm text-emerald-700">Utilizadores com sessão ativa recentemente.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Utilizador selecionado</p>
            <p className="mt-2 truncate text-lg font-semibold text-slate-900">{selectedUser?.name || selectedUser?.email || "Nenhum"}</p>
            <p className="mt-1 truncate text-sm text-slate-500">{selectedUser?.email || "Selecione um registo para editar."}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Utilizadores online</h2>
              <p className="mt-1 text-sm text-slate-600">Lista de sessões ativas detetadas na aplicação.</p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              {onlineUsers.length} online
            </span>
          </div>

          {onlineUsers.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              Não há utilizadores online neste momento.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {onlineUsers.map((user) => (
                <button
                  key={`online-${user.id}`}
                  type="button"
                  onClick={() => setSelectedUserId(String(user.id))}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-100"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-emerald-950">{user.name || user.email}</p>
                      <p className="text-xs text-emerald-800">{user.email}</p>
                    </div>
                    <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {formatSessionCount(user.onlineSessions)} sessão(ões)
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-emerald-800">Última atividade: {formatDateTimeShort(user.presenceLastSeenAt)}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.55fr,1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 grid gap-3 lg:grid-cols-[2fr,1fr,auto]">
              <label className="text-xs font-semibold text-gray-700">
                Pesquisar
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome ou email"
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>
              <label className="text-xs font-semibold text-gray-700">
                Perfil
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                >
                  <option value="">Todos</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="USER">Utilizador</option>
                  <option value="CLIENTE">Cliente</option>
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void fetchUsers()}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Atualizar
                </button>
              </div>
            </div>

            {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            {success && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>}

            <div className="overflow-x-auto">
              <table className="min-w-[960px] text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Perfil</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Sessões</th>
                    <th className="px-3 py-2">Último login</th>
                    <th className="px-3 py-2">Criado</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-gray-500">A carregar utilizadores...</td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-gray-500">Nenhum utilizador encontrado.</td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className={`border-b last:border-b-0 cursor-pointer transition-colors ${String(selectedUserId) === String(user.id) ? "bg-blue-50" : "hover:bg-slate-50"}`}
                        onClick={() => {
                          setSelectedUserId(String(user.id));
                        }}
                      >
                        <td className="px-3 py-2 font-medium text-gray-900">{user.name || "—"}</td>
                        <td className="px-3 py-2 text-gray-700">{user.email}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${user.role === "ADMIN" ? "bg-blue-100 text-blue-800" : user.role === "CLIENTE" ? "bg-purple-100 text-purple-800" : hasElevatedAccess({ role: user.role, permissions: user.permissions }) ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"}`}>
                            {getAccessRoleLabel({ role: user.role, permissions: user.permissions })}
                          </span>
                          {user.role === "CLIENTE" && user.cliente?.nome && (
                            <div className="text-[11px] text-purple-600 font-semibold mt-0.5">{user.cliente.nome}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${user.isOnline ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                            {user.isOnline ? "Online" : "Offline"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{formatSessionCount(user.onlineSessions)}</td>
                        <td className="px-3 py-2 text-gray-600">{formatDateTimeShort(user.lastLoginAt)}</td>
                        <td className="px-3 py-2 text-gray-600">{formatDateTimeShort(user.createdAt)}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedUserId(String(user.id));
                              }}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={deletingUserId === String(user.id) || String(session?.user?.id || "") === String(user.id)}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleDeleteUser(user);
                              }}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              title={String(session?.user?.id || "") === String(user.id) ? "Não pode eliminar o utilizador autenticado." : "Eliminar utilizador"}
                            >
                              {deletingUserId === String(user.id) ? "A eliminar..." : "Eliminar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Novo utilizador</h2>
              <p className="mt-1 text-sm text-gray-600">Criar acessos para administração ou operação.</p>

              <form onSubmit={handleCreateUser} className="mt-4 space-y-3">
                <label className="block text-xs font-semibold text-gray-700">
                  Nome
                  <input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="Nome completo"
                  />
                </label>

                <label className="block text-xs font-semibold text-gray-700">
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="email@empresa.pt"
                    required
                  />
                </label>

                <label className="block text-xs font-semibold text-gray-700">
                  Password
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="Mínimo 8 caracteres"
                    required
                  />
                </label>

                <label className="block text-xs font-semibold text-gray-700">
                  Perfil
                  <select
                    value={form.role}
                    onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as any, clienteId: undefined }))}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="USER">Utilizador</option>
                    <option value="ADMIN">Administrador</option>
                    <option value="CLIENTE">Cliente</option>
                  </select>
                </label>

                {form.role === "CLIENTE" && (
                  <label className="block text-xs font-semibold text-gray-700">
                    Associar ao Cliente
                    <select
                      value={form.clienteId || ""}
                      onChange={(e) => setForm((prev) => ({ ...prev, clienteId: e.target.value ? Number(e.target.value) : undefined }))}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      required
                    >
                      <option value="">-- Selecionar Cliente --</option>
                      {clientsList.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {saving ? "A criar..." : "Adicionar utilizador"}
                </button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Criar a partir de contactos internos</h3>
                  <p className="mt-1 text-xs text-gray-600">
                    Seleciona contactos internos com email e cria contas de equipa com a password pré-definida.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchInternalContacts()}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Atualizar
                </button>
              </div>

              {contactsError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{contactsError}</div>}

              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {internalContacts.length} contacto(s) com email disponível
                </p>
                {internalContacts.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedContactIds((prev) =>
                        prev.length === internalContacts.length
                          ? []
                          : internalContacts.map((c) => String(c.id))
                      )
                    }
                    className="text-[11px] font-semibold text-blue-700 hover:text-blue-800"
                  >
                    {selectedContactIds.length === internalContacts.length ? "Desmarcar todos" : "Marcar todos"}
                  </button>
                )}
              </div>

              <div className="mt-2 max-h-64 space-y-1 overflow-auto rounded-xl border border-slate-200 p-2">
                {internalContacts.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-slate-500">Sem contactos internos com email para converter.</p>
                ) : (
                  internalContacts.map((contact) => (
                    <label key={contact.id} className="inline-flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={selectedContactIds.includes(String(contact.id))}
                        onChange={(e) =>
                          setSelectedContactIds((prev) =>
                            e.target.checked
                              ? [...prev, String(contact.id)]
                              : prev.filter((id) => id !== String(contact.id))
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-slate-900">{contact.nome}</span>
                        <span className="block truncate text-slate-500">{contact.email}</span>
                        {contact.empresa || contact.localizacao ? (
                          <span className="block truncate text-[11px] text-slate-400">
                            {[contact.empresa, contact.localizacao].filter(Boolean).join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))
                )}
              </div>

              <button
                type="button"
                disabled={selectedContactIds.length === 0 || creatingFromContacts}
                onClick={() => void handleCreateFromContacts()}
                className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {creatingFromContacts
                  ? "A criar..."
                  : `Criar utilizadores (${selectedContactIds.length})`}
              </button>
              <p className="mt-2 text-[11px] text-slate-500">
                Cada conta criada usa o email do contacto interno e a password pré-definida cabouco321.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Utilizador selecionado</h3>
                  <p className="mt-1 text-xs text-gray-600">Editar identidade, perfil e password do registo selecionado.</p>
                </div>
                {selectedUser?.role === "ADMIN" ? (
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800">Administrador</span>
                ) : selectedUserAccessLabel === "Testador" ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">Testador</span>
                ) : selectedUser ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">Utilizador</span>
                ) : null}
              </div>

              {!selectedUser ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  Seleciona um utilizador na tabela para editar ou eliminar.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${selectedUser.isOnline ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                        {selectedUser.isOnline ? "Online" : "Offline"}
                      </span>
                      <span>{formatSessionCount(selectedUser.onlineSessions)} sessão(ões) ativa(s)</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Última atividade detetada: {formatDateTimeShort(selectedUser.presenceLastSeenAt)}</p>
                    {Array.isArray(selectedUser.activeSessions) && selectedUser.activeSessions.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {selectedUser.activeSessions.map((activeSession) => (
                          <div key={activeSession.sessionId} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-800">Sessão {activeSession.sessionId.slice(0, 8)}</span>
                              <span>Ativa desde {formatDateTimeShort(activeSession.createdAt)}</span>
                            </div>
                            <div className="mt-1">Última atividade: {formatDateTimeShort(activeSession.lastSeenAt)}</div>
                            {activeSession.lastPath ? <div className="mt-1">Página: <span className="font-mono">{activeSession.lastPath}</span></div> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <label className="block text-xs font-semibold text-gray-700">
                    Nome
                    <input
                      value={selectedUserForm.name}
                      onChange={(e) => setSelectedUserForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      placeholder="Nome completo"
                    />
                  </label>

                  <label className="block text-xs font-semibold text-gray-700">
                    Email
                    <input
                      type="email"
                      value={selectedUserForm.email}
                      onChange={(e) => setSelectedUserForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      placeholder="email@empresa.pt"
                    />
                  </label>

                  <label className="block text-xs font-semibold text-gray-700">
                    Perfil
                    <select
                      value={selectedUserForm.role}
                      onChange={(e) => setSelectedUserForm((prev) => ({ ...prev, role: e.target.value as any, clienteId: undefined }))}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                    >
                      <option value="USER">Utilizador</option>
                      <option value="ADMIN">Administrador</option>
                      <option value="CLIENTE">Cliente</option>
                    </select>
                  </label>

                  {selectedUserForm.role === "CLIENTE" && (
                    <label className="block text-xs font-semibold text-gray-700">
                      Associar ao Cliente
                      <select
                        value={selectedUserForm.clienteId || ""}
                        onChange={(e) => setSelectedUserForm((prev) => ({ ...prev, clienteId: e.target.value ? Number(e.target.value) : undefined }))}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                        required
                      >
                        <option value="">-- Selecionar Cliente --</option>
                        {clientsList.map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="block text-xs font-semibold text-gray-700">
                    Nova password
                    <input
                      type="password"
                      value={selectedUserForm.password}
                      onChange={(e) => setSelectedUserForm((prev) => ({ ...prev, password: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                      placeholder="Deixe vazio para manter a atual"
                    />
                  </label>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={savingSelectedUser}
                      onClick={() => void handleSaveSelectedUser()}
                      className="flex-1 rounded-xl border border-emerald-200 bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {savingSelectedUser ? "A guardar..." : "Guardar utilizador"}
                    </button>
                    <button
                      type="button"
                      disabled={deletingUserId === String(selectedUser.id) || selectedUserIsSelf || (selectedUser.role === "ADMIN" && adminCount <= 1)}
                      onClick={() => void handleDeleteUser(selectedUser)}
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingUserId === String(selectedUser.id) ? "A eliminar..." : "Eliminar utilizador"}
                    </button>
                  </div>

                  {(selectedUserIsSelf || (selectedUser.role === "ADMIN" && adminCount <= 1)) && (
                    <p className="text-xs text-amber-700">
                      {selectedUserIsSelf
                        ? "O utilizador autenticado não pode ser eliminado nem perder o perfil de administrador."
                        : "O último administrador não pode ser eliminado."}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Privilégios por utilizador</h3>
                  <p className="mt-1 text-xs text-gray-600">Seleciona um utilizador na tabela e define permissões granulares ou em massa.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!selectedUserId}
                    onClick={handleSelectAllPrivileges}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                  >
                    Marcar todos os privilégios
                  </button>
                  <button
                    type="button"
                    disabled={!selectedUserId}
                    onClick={handleClearAllPrivileges}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Limpar tudo
                  </button>
                </div>
              </div>

              <label className="mt-3 block text-xs font-semibold text-gray-700">
                Utilizador selecionado
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                  value={selectedUser ? `${selectedUser.name || "—"} <${selectedUser.email}>` : "Nenhum"}
                  readOnly
                />
              </label>

              {loadingPermissions ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">A carregar permissões...</div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-700">Módulos visíveis</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setStringPermissionValues("visibleModules", permissionsCatalog.modules.map((item) => item.key))} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Tudo</button>
                        <button type="button" onClick={() => setStringPermissionValues("visibleModules", [])} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">Limpar</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {permissionsCatalog.modules.map((item) => {
                        const checked = Array.isArray(permissionDraft.visibleModules) && permissionDraft.visibleModules.includes(item.key);
                        return (
                          <label key={item.key} className="inline-flex items-center gap-2 text-xs text-gray-700">
                            <input type="checkbox" checked={checked} onChange={() => toggleStringPermission("visibleModules", item.key)} />
                            <span>{item.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-700">Páginas visíveis</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setStringPermissionValues("visiblePages", permissionsCatalog.pages.map((item) => item.prefix))} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Tudo</button>
                        <button type="button" onClick={() => setStringPermissionValues("visiblePages", [])} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">Limpar</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {permissionsCatalog.pages.map((item) => {
                        const checked = Array.isArray(permissionDraft.visiblePages) && permissionDraft.visiblePages.includes(item.prefix);
                        return (
                          <label key={item.key} className="inline-flex items-center gap-2 text-xs text-gray-700">
                            <input type="checkbox" checked={checked} onChange={() => toggleStringPermission("visiblePages", item.prefix)} />
                            <span>{item.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-700">Páginas editáveis</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setStringPermissionValues("editablePages", permissionsCatalog.pages.map((item) => item.prefix))} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Tudo</button>
                        <button type="button" onClick={() => setStringPermissionValues("editablePages", [])} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">Limpar</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-1">
                      {permissionsCatalog.pages.map((item) => {
                        const checked = Array.isArray(permissionDraft.editablePages) && permissionDraft.editablePages.includes(item.prefix);
                        return (
                          <label key={`edit-${item.key}`} className="inline-flex items-center gap-2 text-xs text-gray-700">
                            <input type="checkbox" checked={checked} onChange={() => toggleStringPermission("editablePages", item.prefix)} />
                            <span>{item.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-700">Campos editáveis (Jangadas detalhe)</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditableFieldValues("jangadas-detail", (permissionsCatalog.editableFields?.["jangadas-detail"] || []).map((field) => field.key))} className="text-[11px] font-semibold text-blue-700 hover:text-blue-800">Tudo</button>
                        <button type="button" onClick={() => setEditableFieldValues("jangadas-detail", [])} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">Limpar</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-1 max-h-44 overflow-auto pr-1">
                      {(permissionsCatalog.editableFields?.["jangadas-detail"] || []).map((field) => {
                        const checked = Array.isArray(permissionDraft.editableFields?.["jangadas-detail"])
                          && permissionDraft.editableFields?.["jangadas-detail"]?.includes(field.key);
                        return (
                          <label key={field.key} className="inline-flex items-center gap-2 text-xs text-gray-700">
                            <input type="checkbox" checked={Boolean(checked)} onChange={() => toggleEditableField("jangadas-detail", field.key)} />
                            <span>{field.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}

              <button
                type="button"
                disabled={!selectedUserId || savingPermissions}
                onClick={() => void handleSavePermissions()}
                className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {savingPermissions ? "A guardar..." : "Guardar privilégios"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
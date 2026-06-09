"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BackendApartment, ApartmentGender } from "@/lib/server-apartments";
import type { BackendDirectoryUser } from "@/lib/server-users";

type Props = {
  apartments: BackendApartment[];
  allResidents: BackendDirectoryUser[];
};

type NewApartmentForm = {
  name: string;
  address: string;
  gender: ApartmentGender | "";
};

const emptyNewForm: NewApartmentForm = { name: "", address: "", gender: "" };

function genderLabel(gender: ApartmentGender | null) {
  if (gender === "male") return "בנים";
  if (gender === "female") return "בנות";
  return null;
}

function genderBadgeClass(gender: ApartmentGender | null) {
  if (gender === "male") return "bg-sky-100 text-sky-800";
  if (gender === "female") return "bg-pink-100 text-pink-800";
  return "bg-stone-100 text-stone-500";
}

export function HousingApartmentsClient({ apartments, allResidents }: Props) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<NewApartmentForm>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState<NewApartmentForm>(emptyNewForm);
  const [addResidentId, setAddResidentId] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!newForm.name.trim()) {
      setError("שם הדירה נדרש.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/apartments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newForm.name.trim(),
          address: newForm.address.trim() || null,
          gender: newForm.gender || null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { message?: string };
        setError(d.message ?? "שגיאה ביצירת הדירה.");
        return;
      }
      setNewForm(emptyNewForm);
      setShowAddForm(false);
      router.refresh();
    } catch {
      setError("שגיאת רשת ביצירת הדירה.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(apartmentId: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/apartments/${apartmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name?.trim() || undefined,
          address: editForm.address !== undefined ? editForm.address.trim() || null : undefined,
          gender: editForm.gender !== undefined ? editForm.gender || null : undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { message?: string };
        setError(d.message ?? "שגיאה בעדכון הדירה.");
        return;
      }
      setEditingId(null);
      setEditForm({});
      router.refresh();
    } catch {
      setError("שגיאת רשת בעדכון הדירה.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(apartmentId: string, name: string) {
    if (!confirm(`למחוק את "${name}"? הדיירים ישארו ללא שיוך דירה.`)) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/apartments/${apartmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = (await res.json()) as { message?: string };
        setError(d.message ?? "שגיאה במחיקת הדירה.");
        return;
      }
      router.refresh();
    } catch {
      setError("שגיאת רשת במחיקת הדירה.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignResident(apartmentId: string) {
    const userId = addResidentId[apartmentId];
    if (!userId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apartmentId }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { message?: string };
        setError(d.message ?? "שגיאה בשיוך הדייר.");
        return;
      }
      setAddResidentId((prev) => ({ ...prev, [apartmentId]: "" }));
      router.refresh();
    } catch {
      setError("שגיאת רשת בשיוך הדייר.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveResident(userId: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apartmentId: null }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { message?: string };
        setError(d.message ?? "שגיאה בהסרת הדייר.");
        return;
      }
      router.refresh();
    } catch {
      setError("שגיאת רשת בהסרת הדייר.");
    } finally {
      setSaving(false);
    }
  }

  // For each apartment, the set of current resident IDs
  const residentIdsByApartment = new Map(
    apartments.map((a) => [a.id, new Set(a.residents.map((r) => r.id))]),
  );

  function availableResidentsFor(apartmentId: string) {
    const currentIds = residentIdsByApartment.get(apartmentId) ?? new Set();
    return allResidents.filter((r) => !currentIds.has(r.id));
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
            ניהול
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            ניהול דירות
          </h1>
          <p className="mt-4 text-sm leading-7 text-stone-300">
            הוספה, עריכה וניהול דיירים לכל דירה בדיור.
          </p>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setShowAddForm((v) => !v);
            setNewForm(emptyNewForm);
            setError("");
          }}
          className="rounded-2xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
        >
          {showAddForm ? "ביטול" : "+ הוסף דירה"}
        </button>
      </div>

      {showAddForm && (
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-stone-900">דירה חדשה</h2>
          <ApartmentForm
            form={newForm}
            onChange={(patch) => setNewForm((p) => ({ ...p, ...patch }))}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="rounded-2xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:bg-stone-400"
          >
            {saving ? "שומר…" : "צור דירה"}
          </button>
        </section>
      )}

      {apartments.length === 0 && !showAddForm ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-sm text-stone-500">
          אין דירות מוגדרות עדיין. לחץ על "הוסף דירה" כדי להתחיל.
        </div>
      ) : (
        <div className="space-y-4">
          {apartments.map((apt) => {
            const isOpen = expandedId === apt.id;
            const isEditing = editingId === apt.id;
            const available = availableResidentsFor(apt.id);

            return (
              <article
                key={apt.id}
                className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm"
              >
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6 pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-stone-900">
                        {apt.name}
                      </h2>
                      {apt.gender && (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${genderBadgeClass(apt.gender)}`}
                        >
                          {genderLabel(apt.gender)}
                        </span>
                      )}
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600">
                        {apt.residents.length} דיירים
                      </span>
                    </div>
                    {apt.address && (
                      <p className="text-sm text-stone-500">{apt.address}</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedId(isOpen ? null : apt.id);
                        setEditingId(null);
                        setEditForm({});
                      }}
                      className="rounded-2xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-900"
                    >
                      {isOpen ? "סגור" : "פתח"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) {
                          setEditingId(null);
                          setEditForm({});
                        } else {
                          setEditingId(apt.id);
                          setExpandedId(apt.id);
                          setEditForm({
                            name: apt.name,
                            address: apt.address ?? "",
                            gender: apt.gender ?? "",
                          });
                        }
                      }}
                      className="rounded-2xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-900"
                    >
                      {isEditing ? "ביטול" : "ערוך"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(apt.id, apt.name)}
                      disabled={saving}
                      className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:border-red-500 disabled:opacity-50"
                    >
                      מחק
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-stone-100 px-6 py-5 space-y-5">
                    {/* Edit form */}
                    {isEditing && (
                      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5 space-y-4">
                        <h3 className="text-sm font-semibold text-stone-700">
                          עריכת פרטי הדירה
                        </h3>
                        <ApartmentForm
                          form={editForm as NewApartmentForm}
                          onChange={(patch) =>
                            setEditForm((p) => ({ ...p, ...patch }))
                          }
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdate(apt.id)}
                          disabled={saving}
                          className="rounded-2xl bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:bg-stone-400"
                        >
                          {saving ? "שומר…" : "שמור שינויים"}
                        </button>
                      </div>
                    )}

                    {/* Residents list */}
                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-stone-400">
                        דיירים
                      </p>

                      {apt.residents.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-400">
                          אין דיירים משויכים לדירה זו.
                        </p>
                      ) : (
                        <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 overflow-hidden">
                          {apt.residents.map((r) => (
                            <li
                              key={r.id}
                              className="flex items-center justify-between gap-3 bg-white px-4 py-3"
                            >
                              <div>
                                <p className="text-sm font-medium text-stone-900">
                                  {r.name ?? r.email}
                                </p>
                                {r.name && (
                                  <p className="text-xs text-stone-400">
                                    {r.email}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveResident(r.id)}
                                disabled={saving}
                                className="rounded-xl border border-stone-200 px-3 py-1 text-xs font-medium text-stone-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                              >
                                הסר
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Add resident */}
                    {available.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3">
                        <select
                          value={addResidentId[apt.id] ?? ""}
                          onChange={(e) =>
                            setAddResidentId((prev) => ({
                              ...prev,
                              [apt.id]: e.target.value,
                            }))
                          }
                          className="flex-1 rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-stone-900"
                        >
                          <option value="">בחר דייר להוספה…</option>
                          {available.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name ?? r.email}
                              {r.apartmentId
                                ? " (משויך לדירה אחרת)"
                                : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAssignResident(apt.id)}
                          disabled={saving || !addResidentId[apt.id]}
                          className="rounded-2xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:bg-stone-400"
                        >
                          הוסף
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApartmentForm({
  form,
  onChange,
}: {
  form: Partial<NewApartmentForm>;
  onChange: (patch: Partial<NewApartmentForm>) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">שם הדירה *</span>
        <input
          type="text"
          value={form.name ?? ""}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="למשל: דירה א׳"
          className="rounded-2xl border border-stone-300 px-4 py-2.5 text-sm outline-none transition focus:border-stone-900"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">כתובת</span>
        <input
          type="text"
          value={form.address ?? ""}
          onChange={(e) => onChange({ address: e.target.value })}
          placeholder="למשל: רחוב הגורן 5"
          className="rounded-2xl border border-stone-300 px-4 py-2.5 text-sm outline-none transition focus:border-stone-900"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-stone-700">סוג דירה</span>
        <select
          value={form.gender ?? ""}
          onChange={(e) =>
            onChange({ gender: e.target.value as ApartmentGender | "" })
          }
          className="rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-stone-900"
        >
          <option value="">לא מוגדר</option>
          <option value="male">בנים</option>
          <option value="female">בנות</option>
        </select>
      </label>
    </div>
  );
}

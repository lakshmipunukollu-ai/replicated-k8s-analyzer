'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthHeaders } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  company_id: string | null;
  company_name: string | null;
  is_active: boolean;
  last_login: string | null;
}

interface CompanyOption {
  id: string;
  name: string;
  slug: string;
}

export default function UsersPage() {
  const { user: currentUser, isAdmin } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'company_user'>('company_user');
  const [formCompanyId, setFormCompanyId] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentUser && !isAdmin) {
      router.replace('/bundles');
      return;
    }
  }, [currentUser, isAdmin, router]);

  function load() {
    const headers = getAuthHeaders();
    Promise.all([
      fetch(`${API}/auth/users`, { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/companies`, { headers }).then((r) => r.json().then((d: CompanyOption[] | { companies?: CompanyOption[] }) => (Array.isArray(d) ? d : (d?.companies ?? [])))).catch(() => []),
    ]).then(([userList, companyList]) => {
      setUsers(Array.isArray(userList) ? userList : []);
      setCompanies(Array.isArray(companyList) ? companyList : []);
    }).finally(() => setLoading(false));
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  function openCreate() {
    setEditUser(null);
    setFormEmail('');
    setFormPassword('');
    setFormName('');
    setFormRole('company_user');
    setFormCompanyId('');
    setFormActive(true);
    setError('');
    setModalOpen(true);
  }

  function openEdit(u: UserRow) {
    setEditUser(u);
    setFormEmail(u.email);
    setFormPassword('');
    setFormName(u.name || '');
    setFormRole((u.role === 'admin' ? 'admin' : 'company_user') as 'admin' | 'company_user');
    setFormCompanyId(u.company_id || '');
    setFormActive(u.is_active);
    setError('');
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    try {
      if (editUser) {
        const body: Record<string, unknown> = { name: formName || null, role: formRole, company_id: formCompanyId || null, is_active: formActive };
        const res = await fetch(`${API}/auth/users/${editUser.id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'Update failed');
        }
      } else {
        const res = await fetch(`${API}/auth/register`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            email: formEmail,
            password: formPassword,
            name: formName || undefined,
            role: formRole,
            company_id: formCompanyId || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'Create failed');
        }
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(u: UserRow) {
    if (!confirm(`Deactivate ${u.email}?`)) return;
    const res = await fetch(`${API}/auth/users/${u.id}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (res.ok) load();
  }

  if (!currentUser) return null;
  if (!isAdmin) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">User management</h1>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          New User
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last login</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((u) => (
                <tr key={u.id} className={!u.is_active ? 'bg-gray-50 opacity-75' : ''}>
                  <td className="px-4 py-2 text-sm text-gray-900">{u.name || '—'}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{u.email}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'}`}>
                      {u.role === 'admin' ? 'Admin' : 'Company User'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">{u.company_name || '—'}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{u.last_login ? new Date(u.last_login).toLocaleString() : '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" onClick={() => openEdit(u)} className="text-blue-600 hover:underline mr-2">
                      Edit
                    </button>
                    {u.is_active && u.id !== currentUser.id && (
                      <button type="button" onClick={() => handleDeactivate(u)} className="text-red-600 hover:underline">
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !submitting && setModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editUser ? 'Edit user' : 'New user'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  required
                  disabled={!!editUser}
                />
              </div>
              {!editUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                    required={!editUser}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as 'admin' | 'company_user')}
                  className="w-full px-3 py-2 border rounded"
                  disabled={editUser?.id === currentUser?.id}
                >
                  <option value="admin">Admin</option>
                  <option value="company_user">Company User</option>
                </select>
              </div>
              {formRole === 'company_user' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                  <select
                    value={formCompanyId}
                    onChange={(e) => setFormCompanyId(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">— None —</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {editUser && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="active"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                  />
                  <label htmlFor="active" className="text-sm text-gray-700">Active</label>
                </div>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Saving…' : editUser ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} disabled={submitting} className="px-4 py-2 border rounded hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

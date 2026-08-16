import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AppShell } from '@/layouts/AppShell'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { ApiError } from '@/services/httpClient'
import type { OrganizationNode } from '@/modules/core/identity/types/identity'
import {
  createOrganization,
  fetchOrganizations,
  updateOrganization,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

type OrgTreeNode = OrganizationNode & { children: OrgTreeNode[] }

function buildTree(items: OrganizationNode[]): OrgTreeNode[] {
  const map = new Map<string, OrgTreeNode>()
  for (const item of items) {
    map.set(item.id, { ...item, children: [] })
  }

  const roots: OrgTreeNode[] = []
  for (const item of items) {
    const node = map.get(item.id)!
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  function sortNodes(nodes: OrgTreeNode[]) {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    for (const node of nodes) {
      sortNodes(node.children)
    }
  }

  sortNodes(roots)
  return roots
}

function OrganizationBranch({
  nodes,
  onToggleStatus,
}: {
  nodes: OrgTreeNode[]
  onToggleStatus: (node: OrganizationNode) => void
}) {
  if (nodes.length === 0) {
    return null
  }

  return (
    <ul className="identity-tree">
      {nodes.map((node) => (
        <li key={node.id}>
          <div className="identity-tree__row">
            <div className="identity-tree__meta">
              <strong>
                {node.name}{' '}
                <span className={`identity-status identity-status--${node.status}`}>{node.status}</span>
              </strong>
              <span>
                {node.code} · {node.type}
              </span>
            </div>
            <div className="identity-inline-actions">
              <Button variant="secondary" size="md" onClick={() => onToggleStatus(node)}>
                {node.status === 'active' ? 'Deactivate' : 'Activate'}
              </Button>
            </div>
          </div>
          <OrganizationBranch nodes={node.children} onToggleStatus={onToggleStatus} />
        </li>
      ))}
    </ul>
  )
}

export function OrganizationPage() {
  const [items, setItems] = useState<OrganizationNode[]>([])
  const [parentId, setParentId] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<OrganizationNode['type']>('department')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const tree = useMemo(() => buildTree(items), [items])

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetchOrganizations()
      setItems(result.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load organizations.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      await createOrganization({
        parentId: parentId || null,
        code,
        name,
        type,
      })
      setCode('')
      setName('')
      setMessage('Organization created.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create organization.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(node: OrganizationNode) {
    try {
      await updateOrganization(node.id, {
        status: node.status === 'active' ? 'inactive' : 'active',
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update organization.')
    }
  }

  return (
    <AppShell>
      <div className="identity-page">
        <header className="identity-page__header">
          <h1>Organization</h1>
          <p>Organization tree — divisions, departments, and teams (Layer 1 · 04).</p>
        </header>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {message ? <Alert variant="success">{message}</Alert> : null}

        <section className="identity-panel">
          <h2>Add node</h2>
          <form className="identity-form" onSubmit={(event) => void handleCreate(event)}>
            <FormField label="Parent" htmlFor="org-parent">
              <select
                id="org-parent"
                className="identity-select"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">Root</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Code" htmlFor="org-code">
              <TextField
                id="org-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="Name" htmlFor="org-name">
              <TextField
                id="org-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </FormField>
            <FormField label="Type" htmlFor="org-type">
              <select
                id="org-type"
                className="identity-select"
                value={type}
                onChange={(event) => setType(event.target.value as OrganizationNode['type'])}
                disabled={isSubmitting}
              >
                <option value="division">division</option>
                <option value="department">department</option>
                <option value="team">team</option>
                <option value="other">other</option>
              </select>
            </FormField>
            <div className="identity-form__actions">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Add'}
              </Button>
            </div>
          </form>
        </section>

        <section className="identity-panel">
          <h2>Tree</h2>
          {isLoading ? <p className="identity-empty">Loading…</p> : null}
          {!isLoading && tree.length === 0 ? <p className="identity-empty">No organizations.</p> : null}
          <OrganizationBranch nodes={tree} onToggleStatus={(node) => void handleToggleStatus(node)} />
        </section>
      </div>
    </AppShell>
  )
}

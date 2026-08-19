import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { FlashToasts } from '@/components/ui/FlashToasts'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { FormField } from '@/components/ui/FormField'
import { TextField } from '@/components/ui/TextField'
import { SidebarSelect } from '@/components/navigation/SidebarSelect'
import { IconBan, IconCircleCheck, IconTrash } from '@/components/icons/Icons'
import { ApiError } from '@/services/httpClient'
import type { OrganizationNode } from '@/modules/core/identity/types/identity'
import { formatStatusLabel } from '@/modules/core/identity/types/identity'
import {
  createOrganization,
  deleteOrganization,
  fetchOrganizations,
  updateOrganization,
} from '@/modules/core/identity/services/identityService'
import './IdentityPage.css'

type OrgTreeNode = OrganizationNode & { children: OrgTreeNode[] }

const ORG_TYPE_OPTIONS = [
  { value: 'division', label: 'Division' },
  { value: 'department', label: 'Department' },
  { value: 'team', label: 'Team' },
  { value: 'other', label: 'Other' },
] as const

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
  onDelete,
}: {
  nodes: OrgTreeNode[]
  onToggleStatus: (node: OrganizationNode) => void
  onDelete: (node: OrganizationNode) => void
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
                <span className={`identity-status identity-status--${node.status}`}>
                  {formatStatusLabel(node.status)}
                </span>
              </strong>
              <span>
                {node.code} · {node.type}
              </span>
            </div>
            <div className="identity-inline-actions">
              <IconButton
                label={node.status === 'active' ? 'Active' : 'Inactive'}
                variant={node.status === 'active' ? 'secondary' : 'danger'}
                onClick={() => onToggleStatus(node)}
              >
                {node.status === 'active' ? <IconCircleCheck /> : <IconBan />}
              </IconButton>
              <IconButton label="Delete" variant="danger" onClick={() => onDelete(node)}>
                <IconTrash />
              </IconButton>
            </div>
          </div>
          <OrganizationBranch nodes={node.children} onToggleStatus={onToggleStatus} onDelete={onDelete} />
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
  const parentOptions = useMemo(
    () => [
      { value: '', label: 'Root' },
      ...items.map((item) => ({ value: item.id, label: `${item.name} (${item.code})` })),
    ],
    [items],
  )

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

  useEffect(() => {
    if (!message) {
      return
    }
    const timeoutId = window.setTimeout(() => setMessage(null), 1000)
    return () => window.clearTimeout(timeoutId)
  }, [message])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      const created = await createOrganization({
        parentId: parentId || null,
        code,
        name,
        type,
      })
      setCode('')
      setName('')
      setMessage('Organization created.')
      setItems((current) => [...current, created])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create organization.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleToggleStatus(node: OrganizationNode) {
    setError(null)
    try {
      const updated = await updateOrganization(node.id, {
        status: node.status === 'active' ? 'inactive' : 'active',
      })
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update organization.')
    }
  }

  async function handleDelete(node: OrganizationNode) {
    setError(null)
    setMessage(null)
    try {
      await deleteOrganization(node.id)
      setItems((current) => current.filter((item) => item.id !== node.id))
      setParentId((current) => (current === node.id ? '' : current))
      setMessage('Organization deleted.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete organization.')
    }
  }

  return (
    <div className="identity-page">
        <header className="identity-page__header">
          <h1>Organization</h1>
          <p>Organization tree — divisions, departments, and teams (Layer 1 · 04).</p>
        </header>

        <FlashToasts
          error={error}
          message={message}
          onClearError={() => setError(null)}
          onClearMessage={() => setMessage(null)}
        />

        <section className="identity-panel">
          <h2>Add node</h2>
          <form className="identity-form" onSubmit={(event) => void handleCreate(event)}>
            <FormField label="Parent" htmlFor="org-parent">
              <SidebarSelect
                id="org-parent"
                label="Parent"
                hideLabel
                value={parentId}
                options={parentOptions}
                onChange={setParentId}
                disabled={isSubmitting}
              />
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
              <SidebarSelect
                id="org-type"
                label="Type"
                hideLabel
                value={type}
                options={[...ORG_TYPE_OPTIONS]}
                onChange={(value) => setType(value as OrganizationNode['type'])}
                disabled={isSubmitting}
              />
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
          <OrganizationBranch
            nodes={tree}
            onToggleStatus={(node) => void handleToggleStatus(node)}
            onDelete={(node) => void handleDelete(node)}
          />
        </section>
      </div>
  )
}

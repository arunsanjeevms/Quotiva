import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  Eraser,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Underline,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tooltip } from './Menu';

/**
 * Constrained rich-text editor for document notes and terms
 * (docs/12-notes-and-terms.md §5).
 *
 * The toolbar deliberately offers no colours, fonts or sizes — the document
 * template owns typography. This client-side constraint is a UX affordance, not
 * a security control: the server sanitizes every value on write, and only the
 * allowed tag set survives.
 */

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S',
  'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'HR',
]);

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/** Mirror of the server allowlist, applied on paste and before emitting change. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  const walk = (node: Element): void => {
    for (const child of [...node.children]) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Unwrap disallowed elements, keeping their text content.
        const text = doc.createTextNode(child.textContent ?? '');
        child.replaceWith(text);
        continue;
      }
      for (const attr of [...child.attributes]) {
        const keep =
          child.tagName === 'A' && (attr.name === 'href' || attr.name === 'title');
        if (!keep) child.removeAttribute(attr.name);
      }
      if (child.tagName === 'A') {
        const href = child.getAttribute('href') ?? '';
        let safe = false;
        try {
          safe = SAFE_SCHEMES.includes(new URL(href, window.location.origin).protocol);
        } catch {
          safe = false;
        }
        if (!safe) {
          child.replaceWith(doc.createTextNode(child.textContent ?? ''));
          continue;
        }
        child.setAttribute('rel', 'noopener noreferrer nofollow');
        child.setAttribute('target', '_blank');
      }
      walk(child);
    }
  };

  walk(root);
  return root.innerHTML;
}

/** True when the value has no visible text — used to hide empty document sections. */
export function hasContent(html: string | null | undefined): boolean {
  if (!html) return false;
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length > 0;
}

export interface RichTextEditorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  maxLength?: number;
  className?: string;
  id?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start typing…',
  disabled = false,
  minHeight = 120,
  maxLength = 50_000,
  className,
  id,
}: RichTextEditorProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(!hasContent(value));

  // Only write into the DOM when the incoming value diverges, so typing is not
  // interrupted by caret resets on every keystroke.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = value ?? '';
    if (el.innerHTML !== next) el.innerHTML = next;
    setEmpty(!hasContent(next));
  }, [value]);

  const emit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeHtml(el.innerHTML).slice(0, maxLength);
    setEmpty(!hasContent(html));
    onChange(hasContent(html) ? html : null);
  }, [onChange, maxLength]);

  const exec = (command: string, arg?: string): void => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const addLink = (): void => {
    const url = window.prompt('Link URL (http, https, mailto or tel)');
    if (!url) return;
    try {
      if (!SAFE_SCHEMES.includes(new URL(url).protocol)) {
        window.alert('That link type is not allowed.');
        return;
      }
    } catch {
      window.alert('That does not look like a valid URL.');
      return;
    }
    exec('createLink', url);
  };

  const tools = [
    { icon: Bold, label: 'Bold', run: () => exec('bold') },
    { icon: Italic, label: 'Italic', run: () => exec('italic') },
    { icon: Underline, label: 'Underline', run: () => exec('underline') },
    { icon: Heading2, label: 'Heading', run: () => exec('formatBlock', '<h2>') },
    { icon: Heading3, label: 'Subheading', run: () => exec('formatBlock', '<h3>') },
    { icon: List, label: 'Bulleted list', run: () => exec('insertUnorderedList') },
    { icon: ListOrdered, label: 'Numbered list', run: () => exec('insertOrderedList') },
    { icon: Link2, label: 'Link', run: addLink },
    { icon: Eraser, label: 'Clear formatting', run: () => exec('removeFormat') },
  ];

  return (
    <div
      className={cn(
        'overflow-hidden rounded border border-line bg-surface shadow-sm transition-colors',
        focused && 'border-primary ring-2 ring-primary/20',
        disabled && 'bg-subtle opacity-70',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-subtle/50 px-1 py-1">
        {tools.map((tool) => (
          <Tooltip key={tool.label} content={tool.label}>
            <button
              type="button"
              disabled={disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={tool.run}
              aria-label={tool.label}
              className="rounded p-1.5 text-content-secondary transition-colors hover:bg-surface hover:text-content disabled:opacity-40"
            >
              <tool.icon className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="relative">
        {empty && !focused && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-base text-content-muted">
            {placeholder}
          </span>
        )}
        <div
          id={id}
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emit}
          onBlur={() => {
            setFocused(false);
            emit();
          }}
          onFocus={() => setFocused(true)}
          onPaste={(e) => {
            // Paste as sanitized HTML rather than whatever the clipboard carries.
            e.preventDefault();
            const html = e.clipboardData.getData('text/html');
            const text = e.clipboardData.getData('text/plain');
            document.execCommand(
              'insertHTML',
              false,
              html ? sanitizeHtml(html) : text.replace(/</g, '&lt;'),
            );
            emit();
          }}
          style={{ minHeight }}
          className={cn(
            'prose-editor px-3 py-2.5 text-base leading-relaxed text-content outline-none',
            '[&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-h3 [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-semibold',
            '[&_p]:mb-1.5 [&_ul]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-5',
            '[&_li]:mb-0.5 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-content-secondary',
          )}
        />
      </div>
    </div>
  );
}

/** Read-only renderer for already-sanitized content (previews, document blocks). */
export function RichTextView({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}): React.ReactElement | null {
  if (!hasContent(html)) return null;
  return (
    <div
      className={cn(
        'text-base leading-relaxed text-content-secondary',
        '[&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-h3 [&_h2]:text-content [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-content',
        '[&_p]:mb-1.5 [&_ul]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_li]:mb-0.5 [&_a]:text-primary [&_a]:underline',
        className,
      )}
      // Content is sanitized on write by the server and again by sanitizeHtml
      // before it is ever stored. This is the single audited raw-HTML seam.
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html ?? '') }}
    />
  );
}

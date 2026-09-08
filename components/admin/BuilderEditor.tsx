"use client";

import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Check, Copy, Eye, EyeOff, Plus, Trash2, User, X } from "lucide-react";
import type { BlockType, PageBlock, SmartPage, ThemeSettings } from "@/lib/types";
import { blockTypes } from "@/lib/utils";
import { applyThemeDefinition, resolveAlignment, resolveButtonStyle, resolveProfileLayout, themeLibrary } from "@/lib/themes";
import { ImageUploader } from "../ImageUploader";
import { PageRenderer, resolveBlockIcon } from "../PageRenderer";
import { PhoneFrame } from "../PhoneFrame";
import { Dialog, EmptyState, Field, IconButton, SectionHeading } from "./AdminUI";

export type BuilderTab = "profile" | "content" | "design" | "seo" | "integrations";
type Props = {
  page: SmartPage;
  tab: BuilderTab;
  onTab: (tab: BuilderTab) => void;
  onEdit: (patch: Partial<SmartPage>) => void;
  onBlock: (id: number, patch: Partial<PageBlock>) => void;
  onAdd: (type: BlockType) => void;
  onDelete: (block: PageBlock) => void;
  onDuplicate: (block: PageBlock) => void;
  onMove: (id: number, direction: number) => void;
  busy: boolean;
};

export function BuilderEditor(props: Props) {
  const { page, tab, onTab, onEdit, busy } = props;
  const [mobileView, setMobileView] = useState("edit");
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const theme = (patch: Partial<ThemeSettings>) => onEdit({ theme: { ...page.theme, ...patch } });
  return <div className="admBuilder" data-mobile-view={mobileView}>
    <div className="admMobileSwitch" role="group" aria-label="Builder view">
      {['edit', 'preview'].map(view => <button type="button" aria-pressed={mobileView === view} onClick={() => setMobileView(view)} key={view}>{view === 'edit' ? 'Edit' : 'Preview'}</button>)}
    </div>
    <section className="admEditorPanel" aria-label="Page editing controls">
      <nav className="admEditorTabs" aria-label="Page editor sections">
        {([['profile', 'Profile'], ['content', 'Content'], ['design', 'Design'], ['seo', 'SEO'], ['integrations', 'Integrations']] as const).map(([value, label]) => <button type="button" key={value} aria-current={tab === value ? 'page' : undefined} onClick={() => onTab(value)}>{label}</button>)}
      </nav>
      <div className="admEditorBody">
        {tab === 'profile' && <ProfileFields page={page} onEdit={onEdit} />}
        {tab === 'content' && <>
          <SectionHeading title="Page content"><button type="button" className="admButton admPrimary" disabled={busy} onClick={() => setPicker(true)}><Plus size={16} />Add block</button></SectionHeading>
          {!page.blocks.length && <EmptyState title="No content blocks yet"><button type="button" className="admButton" onClick={() => setPicker(true)}><Plus size={16} />Add first block</button><button type="button" className="admTextButton" onClick={() => onTab('profile')}><User size={16} />Edit profile</button></EmptyState>}
          <div className="admBlockList">{[...page.blocks].sort((a, b) => a.sortOrder - b.sortOrder).map((block, index) => <BlockFields key={block.id} block={block} selected={selectedBlock === block.id} onSelect={() => setSelectedBlock(selectedBlock === block.id ? null : block.id)} first={index === 0} last={index === page.blocks.length - 1} busy={busy} onEdit={patch => props.onBlock(block.id, patch)} onDelete={() => props.onDelete(block)} onDuplicate={() => props.onDuplicate(block)} onMove={direction => props.onMove(block.id, direction)} />)}</div>
        </>}
        {tab === 'design' && <>
          <SectionHeading title="Appearance" />
          <ThemeGallery current={page.theme} onSelect={next => onEdit({ theme: next })} />
          <section className="admFormSection"><h3>Background & typography</h3><div className="admFormGrid">
            <Field label="Background style"><select value={page.theme.backgroundStyle || 'gradient'} onChange={event => theme({ backgroundStyle: event.target.value as 'solid' | 'gradient' })}><option value="solid">Solid</option><option value="gradient">Gradient</option></select></Field>
            <Field label="Font"><select value={page.theme.font} onChange={event => theme({ font: event.target.value as ThemeSettings['font'] })}>{['inter', 'system', 'serif', 'mono'].map(font => <option key={font} value={font}>{font}</option>)}</select></Field>
            <ColorField label="Background" value={page.theme.backgroundColor} onChange={backgroundColor => theme({ backgroundColor })} />
            <ColorField label="Heading" value={page.theme.headingColor} onChange={headingColor => theme({ headingColor })} />
            <ColorField label="Body text" value={page.theme.textColor} onChange={textColor => theme({ textColor })} />
            {page.theme.backgroundStyle !== 'solid' && <><ColorField label="Gradient start" value={page.theme.gradientFrom} onChange={gradientFrom => theme({ gradientFrom })} /><ColorField label="Gradient end" value={page.theme.gradientTo} onChange={gradientTo => theme({ gradientTo })} /></>}
          </div></section>
          <section className="admFormSection"><h3>Buttons & spacing</h3><div className="admFormGrid">
            <Field label="Button style"><select value={resolveButtonStyle(page.theme)} onChange={event => theme({ buttonStyle: event.target.value as ThemeSettings['buttonStyle'] })}>{['solid', 'glass', 'soft', 'outline', 'pill', 'minimal', 'elevated', 'neon'].map(style => <option key={style}>{style}</option>)}</select></Field>
            <Field label="Page surface"><select value={page.theme.surface || 'glass'} onChange={event => theme({ surface: event.target.value as ThemeSettings['surface'] })}>{['plain', 'plain-dark', 'solid', 'glass', 'glass-dark'].map(surface => <option key={surface}>{surface}</option>)}</select></Field>
            <ColorField label="Button background" value={page.theme.buttonBackground} onChange={buttonBackground => theme({ buttonBackground })} />
            <ColorField label="Button text" value={page.theme.buttonTextColor} onChange={buttonTextColor => theme({ buttonTextColor })} />
            <Field label="Button border"><input value={page.theme.buttonBorderColor} onChange={event => theme({ buttonBorderColor: event.target.value })} /></Field>
            <Range label="Corner radius" value={page.theme.buttonRadius} max={40} onChange={buttonRadius => theme({ buttonRadius })} />
            <Range label="Content spacing" value={page.theme.spacing} min={6} max={32} onChange={spacing => theme({ spacing })} />
            <Range label="Button opacity" value={page.theme.buttonTransparency} min={15} max={100} onChange={buttonTransparency => theme({ buttonTransparency })} />
            <Range label="Glass blur" value={page.theme.glassBlur} max={40} onChange={glassBlur => theme({ glassBlur })} />
          </div></section>
        </>}
        {tab === 'seo' && <><SectionHeading title="Search & sharing" /><div className="admFormStack">{([['seoTitle', 'Search title'], ['metaDescription', 'Search description'], ['socialTitle', 'Social title'], ['socialDescription', 'Social description']] as const).map(([key, label]) => <Field label={label} key={key}><input value={page.seo[key]} onChange={event => onEdit({ seo: { ...page.seo, [key]: event.target.value } })} /></Field>)}<ImageUploader category="og" label="Social preview image" value={page.seo.ogImage} onChange={ogImage => onEdit({ seo: { ...page.seo, ogImage } })} /><ImageUploader category="favicon" label="Favicon" value={page.seo.favicon} onChange={favicon => onEdit({ seo: { ...page.seo, favicon } })} /></div></>}
        {tab === 'integrations' && <><SectionHeading title="Integrations" /><div className="admFormStack"><Field label="Meta Pixel ID"><input value={page.integrations.metaPixelId} onChange={event => onEdit({ integrations: { ...page.integrations, metaPixelId: event.target.value } })} /></Field><Field label="Google Tag Manager ID"><input value={page.integrations.gtmId} onChange={event => onEdit({ integrations: { ...page.integrations, gtmId: event.target.value } })} /></Field></div></>}
      </div>
    </section>
    <aside className="admPreviewPane" aria-label="Live mobile preview">
      <header><span className="admLiveDot" />Live preview<span>9:16</span></header>
      <PhoneFrame label={`${page.title || page.name} mobile preview`}><PageRenderer page={page} preview /></PhoneFrame>
      <span className="admPreviewSlug">/{page.slug}</span>
    </aside>
    {picker && <Dialog title="Add content" onClose={() => setPicker(false)}><div className="admBlockPicker">{blockTypes.map(type => <button type="button" key={type.value} onClick={() => { props.onAdd(type.value); setPicker(false); }}><span>{resolveBlockIcon('', type.value)}</span>{type.label}<Plus size={15} /></button>)}</div></Dialog>}
  </div>;
}

export function ProfileFields({ page, onEdit }: { page: SmartPage; onEdit: (patch: Partial<SmartPage>) => void }) {
  const theme = (patch: Partial<ThemeSettings>) => onEdit({ theme: { ...page.theme, ...patch } });
  return <><SectionHeading title="Profile" /><div className="admFormGrid">
    <Field label="Page name"><input value={page.name} onChange={event => onEdit({ name: event.target.value })} required /></Field>
    <Field label="URL slug"><input value={page.slug} onChange={event => onEdit({ slug: event.target.value })} required /></Field>
    <div className="admSpanFull"><Field label="Profile title"><input value={page.title} onChange={event => onEdit({ title: event.target.value })} /></Field></div>
    <div className="admSpanFull"><Field label="Bio"><textarea rows={3} value={page.bio} onChange={event => onEdit({ bio: event.target.value })} /></Field></div>
    <div className="admSpanFull"><ImageUploader category="logo" label="Logo" round value={page.logoImage || page.profileImage} onChange={logoImage => onEdit({ logoImage })} /></div>
    <div className="admSpanFull"><ImageUploader category="profile" label="Profile photo" round value={page.profileImage} onChange={profileImage => onEdit({ profileImage })} /></div>
    <div className="admSpanFull"><ImageUploader category="banner" label="Cover image" value={page.theme.backgroundImage} onChange={backgroundImage => theme({ backgroundImage })} /></div>
    <Field label="Profile layout"><select value={resolveProfileLayout(page.theme)} onChange={event => theme({ profileLayout: event.target.value as ThemeSettings['profileLayout'] })}><option value="hero">Banner and profile</option><option value="centered">Stacked profile</option><option value="avatar">Profile without banner</option><option value="none">Text only</option></select></Field>
    <Field label="Alignment"><span className="admSegmented" role="group" aria-label="Profile alignment">{([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([value, Icon]) => <button type="button" key={value} title={`Align ${value}`} aria-label={`Align ${value}`} aria-pressed={resolveAlignment(page.theme) === value} onClick={() => theme({ profileAlignment: value })}><Icon size={18} /></button>)}</span></Field>
    <label className="admCheck"><input type="checkbox" checked={page.theme.showShareButton ?? false} onChange={event => theme({ showShareButton: event.target.checked })} />Show Share button</label>
  </div></>;
}

function BlockFields({ block, selected, first, last, busy, onSelect, onEdit, onDelete, onDuplicate, onMove }: {
  block: PageBlock; selected: boolean; first: boolean; last: boolean; busy: boolean;
  onSelect: () => void; onEdit: (patch: Partial<PageBlock>) => void; onDelete: () => void; onDuplicate: () => void; onMove: (direction: number) => void;
}) {
  const [iconsOpen, setIconsOpen] = useState(false);
  const video = block.type === 'video' || block.type === 'youtube';
  const link = !['heading', 'text', 'divider', 'image', 'video', 'youtube'].includes(block.type);
  return <article className={`admBlock ${!block.isActive ? 'admBlockHidden' : ''}`}>
    <header><button type="button" className="admBlockSummary" onClick={onSelect} aria-expanded={selected}><span>{resolveBlockIcon(block.icon, block.type)}</span><span><strong>{block.title || blockTypes.find(type => type.value === block.type)?.label}</strong><small>{block.type}</small></span></button><div className="admActionRow"><IconButton icon={block.isActive ? Eye : EyeOff} label={block.isActive ? 'Hide block' : 'Show block'} onClick={() => onEdit({ isActive: !block.isActive })} /><IconButton icon={ArrowUp} label="Move block up" disabled={first || busy} onClick={() => onMove(-1)} /><IconButton icon={ArrowDown} label="Move block down" disabled={last || busy} onClick={() => onMove(1)} /><IconButton icon={Copy} label="Duplicate block" disabled={busy} onClick={onDuplicate} /><IconButton icon={Trash2} label="Delete block" disabled={busy} onClick={onDelete} /></div></header>
    {selected && <div className="admBlockFields">
      {block.type !== 'divider' && <Field label={video ? 'Caption' : 'Title'}><input value={block.title} onChange={event => onEdit({ title: event.target.value })} /></Field>}
      {block.type === 'text' ? <Field label="Text"><textarea rows={4} value={block.subtitle} onChange={event => onEdit({ subtitle: event.target.value })} /></Field> : link && <Field label="Subtitle"><input value={block.subtitle} onChange={event => onEdit({ subtitle: event.target.value })} /></Field>}
      {link && !['phone', 'whatsapp'].includes(block.type) && <Field label={block.type === 'email' ? 'Email' : 'URL or username'}><input value={block.url} onChange={event => onEdit({ url: event.target.value })} /></Field>}
      {['phone', 'whatsapp'].includes(block.type) && <Field label="Phone number"><input type="tel" value={block.phone} onChange={event => onEdit({ phone: event.target.value })} /></Field>}
      {['email', 'whatsapp'].includes(block.type) && <Field label="Prefilled message"><textarea value={block.message} onChange={event => onEdit({ message: event.target.value })} /></Field>}
      {video && <Field label="Video URL"><input type="url" value={block.videoUrl || block.url} onChange={event => onEdit({ videoUrl: event.target.value, url: event.target.value })} /></Field>}
      {block.type === 'image' && <ImageUploader category="block" label="Image" value={block.imageUrl || block.url} onChange={imageUrl => onEdit({ imageUrl })} />}
      {link && <><div className="admFormGrid"><Field label="Icon"><button type="button" className="admButton" onClick={() => setIconsOpen(true)}>{resolveBlockIcon(block.icon, block.type)}Choose icon</button></Field><Field label="Button color"><div className="admActionRow"><input aria-label="Custom button color" type="color" value={typeof block.settings.buttonColor === 'string' ? block.settings.buttonColor : '#000000'} onChange={event => onEdit({ settings: { ...block.settings, buttonColor: event.target.value } })} /><IconButton icon={X} label="Use theme button color" onClick={() => onEdit({ settings: { ...block.settings, buttonColor: '' } })} /></div></Field></div></>}
    </div>}
    {iconsOpen && <Dialog title="Choose icon" onClose={() => setIconsOpen(false)}><div className="admFormStack"><div className="admIconPicker">{['none', 'link', 'globe', 'message', 'mail', 'phone', 'send', 'share', 'map-pin', 'shopping-bag', 'star', 'heart', 'music', 'video', 'image', 'help', 'sparkles', 'instagram', 'facebook', 'youtube'].map(icon => <button type="button" key={icon} title={icon} aria-label={icon} aria-pressed={block.icon === icon} onClick={() => { onEdit({ icon }); setIconsOpen(false); }}>{icon === 'none' ? <X size={18} /> : resolveBlockIcon(icon, block.type)}</button>)}</div><Field label="Emoji"><input value={block.icon.startsWith('emoji:') ? block.icon.slice(6) : ''} onChange={event => onEdit({ icon: `emoji:${event.target.value}` })} /></Field><ImageUploader category="icon" label="Custom icon" value={block.icon.startsWith('/uploads/') || block.icon.startsWith('https://') ? block.icon : ''} onChange={icon => { onEdit({ icon }); setIconsOpen(false); }} /></div></Dialog>}
  </article>;
}

export function ThemeGallery({ current, onSelect }: { current: ThemeSettings; onSelect: (theme: ThemeSettings) => void }) {
  return <div className="admThemeGrid">{themeLibrary.map(theme => <button type="button" className="admTheme" key={theme.id} aria-pressed={current.preset === theme.id} onClick={() => onSelect(applyThemeDefinition(theme, current))}>
    <span className="admThemePreview" style={{ background: `linear-gradient(135deg, ${theme.settings.gradientFrom}, ${theme.settings.gradientTo})` }}><i style={{ background: theme.settings.headingColor }} /><b style={{ background: theme.settings.headingColor }} /><span style={{ background: theme.settings.buttonBackground, borderColor: theme.settings.buttonBorderColor, borderRadius: Math.min(theme.settings.buttonRadius, 10) }} /><span style={{ background: theme.settings.buttonBackground, borderColor: theme.settings.buttonBorderColor, borderRadius: Math.min(theme.settings.buttonRadius, 10) }} /></span>
    <strong>{theme.label}{current.preset === theme.id && <Check size={15} />}</strong>
  </button>)}</div>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><span className="admColor"><input type="color" value={value} onChange={event => onChange(event.target.value)} /><code>{value}</code></span></Field>;
}

function Range({ label, value, min = 0, max, onChange }: { label: string; value: number; min?: number; max: number; onChange: (value: number) => void }) {
  return <Field label={`${label} (${value})`}><input type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} /></Field>;
}

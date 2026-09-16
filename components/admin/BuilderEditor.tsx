"use client";

import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Bell, Check, Copy, Eye, EyeOff, LayoutList, Plus, RotateCcw, Trash2, User, X } from "lucide-react";
import type { BlockType, PageBlock, SmartPage, ThemeSettings } from "@/lib/types";
import { blockTypes, slugify, slugifyDraft } from "@/lib/utils";
import { applyThemeDefinition, resolveAlignment, resolveButtonStyle, resolveProfileLayout, themeLibrary } from "@/lib/themes";
import { ImageUploader } from "../ImageUploader";
import { PageRenderer, resolveBlockIcon } from "../PageRenderer";
import { PhoneFrame } from "../PhoneFrame";
import { Button, Dialog, EmptyState, Field, IconButton, SectionHeading } from "./AdminUI";
import { notificationPromptDefaults, resolveNotificationPrompt, type NotificationPromptCopyKey } from '@/lib/notificationPrompt';

export type BuilderTab = "profile" | "content" | "design" | "seo" | "integrations" | "notifications";

const buttonEffects = [
  ["none", "None"],
  ["shine", "Shine sweep"],
  ["border-glow", "Border glow"],
  ["neon-border", "Neon border"],
  ["pulse", "Soft pulse"],
  ["breathe", "Breathe"],
  ["lift", "Floating lift"],
  ["slide-light", "Sliding light"],
  ["aurora", "Aurora wash"],
  ["double-ring", "Double ring"],
  ["spotlight", "Spotlight"],
] as const;

export function NotificationPromptFields({ page, onEdit }: { page: SmartPage; onEdit: (patch: Partial<SmartPage>) => void }) {
  const settings = page.integrations.notificationPrompt || {};
  const enabled = settings.enabled === true;
  const updateSettings = (next: typeof settings) => onEdit({ integrations: { ...page.integrations, notificationPrompt: next } });
  const setText = (key: NotificationPromptCopyKey, value: string) => updateSettings({ ...settings, [key]: value });
  const renderPromptField = (name: NotificationPromptCopyKey, label: string, long = false) =>
    <Field key={name} label={label}>{long ? <textarea dir="auto" rows={3} maxLength={400} placeholder={notificationPromptDefaults[name]} value={settings[name] ?? ''} onChange={event => setText(name, event.target.value)} /> : <input dir="auto" maxLength={120} placeholder={notificationPromptDefaults[name]} value={settings[name] ?? ''} onChange={event => setText(name, event.target.value)} />}</Field>;

  return <><SectionHeading title="Notifications" />
    <div className="admPromptLayout">
      <div className="admFormStack">
        <label className="admSwitchRow">
          <span><strong>Visitor prompt</strong><small>{enabled ? 'Visitors can subscribe on this page.' : 'Visitors will not see the subscribe prompt.'}</small></span>
          <input type="checkbox" checked={enabled} onChange={event => updateSettings({ ...settings, enabled: event.target.checked })} />
        </label>
        <section className="admFormSection">
          <h3>Subscribe prompt</h3>
          {renderPromptField('heading', 'Heading')}
          {renderPromptField('message', 'Message', true)}
          {renderPromptField('allowLabel', 'Allow button')}
        </section>
        <section className="admFormSection">
          <h3>If subscription fails</h3>
          {renderPromptField('retryLabel', 'Retry button')}
          {renderPromptField('errorMessage', 'Error message', true)}
        </section>
        <details className="admFormSection admPromptAdvanced">
          <summary>iPhone and unsupported browser text</summary>
          <div className="admFormStack">
            {renderPromptField('installHeading', 'iPhone heading')}
            {renderPromptField('installMessage', 'iPhone requirement', true)}
            {renderPromptField('installStepOne', 'iPhone step 1', true)}
            {renderPromptField('installStepTwo', 'iPhone step 2', true)}
            {renderPromptField('installStepThree', 'iPhone step 3', true)}
            {renderPromptField('updateMessage', 'Older iPhone message', true)}
            {renderPromptField('unsupportedMessage', 'Unsupported browser message', true)}
            {renderPromptField('blockedMessage', 'Blocked permission message', true)}
            {renderPromptField('secureMessage', 'HTTPS message', true)}
          </div>
        </details>
      </div>
    </div>
  </>;
}

export function NotificationPromptPreview({ page }: { page: SmartPage }) {
  const settings = page.integrations.notificationPrompt || {};
  const copy = resolveNotificationPrompt(settings);
  const enabled = settings.enabled === true;
  return <aside className="admPromptPreviewWrap">
    <SectionHeading title="Prompt preview" />
    <section className={`admPromptCopyPreview ${!enabled ? 'admPromptCopyPreviewOff' : ''}`} dir="auto" aria-label="Notification prompt preview">
      <span aria-hidden="true"><Bell size={28} /></span>
      <h3>{copy.heading}</h3>
      <strong>{page.title || page.name}</strong>
      <p>{copy.message}</p>
      <div>{copy.allowLabel}</div>
    </section>
  </aside>;
}

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
        {([['profile', 'Profile'], ['content', 'Content'], ['design', 'Design'], ['seo', 'SEO'], ['integrations', 'Integrations'], ['notifications', 'Notifications']] as const).map(([value, label]) => <button type="button" key={value} aria-current={tab === value ? 'page' : undefined} onClick={() => onTab(value)}>{label}</button>)}
      </nav>
      <div className="admEditorBody">
        {tab === 'profile' && <ProfileFields page={page} onEdit={onEdit} />}
        {tab === 'content' && <>
          <SectionHeading title="Page content"><Button variant="primary" icon={Plus} disabled={busy} onClick={() => setPicker(true)}>Add block</Button></SectionHeading>
          {!page.blocks.length && <EmptyState icon={LayoutList} title="No content blocks yet" description="Add links, text, images or videos to build out this page."><Button variant="primary" icon={Plus} onClick={() => setPicker(true)}>Add first block</Button><Button icon={User} onClick={() => onTab('profile')}>Edit profile</Button></EmptyState>}
          <div className="admBlockList">{[...page.blocks].sort((a, b) => a.sortOrder - b.sortOrder).map((block, index) => <BlockFields key={block.id} block={block} selected={selectedBlock === block.id} onSelect={() => setSelectedBlock(selectedBlock === block.id ? null : block.id)} first={index === 0} last={index === page.blocks.length - 1} busy={busy} onEdit={patch => props.onBlock(block.id, patch)} onDelete={() => props.onDelete(block)} onDuplicate={() => props.onDuplicate(block)} onMove={direction => props.onMove(block.id, direction)} />)}</div>
        </>}
        {tab === 'design' && <>
          <SectionHeading title="Appearance" />
          <ThemeGallery current={page.theme} onSelect={next => onEdit({ theme: next })} />
          <section className="admFormSection"><h3>Background & typography</h3><div className="admFormGrid">
            <Field label="Background style"><select value={page.theme.backgroundStyle || (page.theme.pageBackground ? 'image' : 'gradient')} onChange={event => theme({ backgroundStyle: event.target.value as 'solid' | 'gradient' | 'image' })}><option value="gradient">Gradient</option><option value="solid">Solid color</option><option value="image">Custom wallpaper image</option></select></Field>
            <Field label="Font"><select value={page.theme.font} onChange={event => theme({ font: event.target.value as ThemeSettings['font'] })}>{['inter', 'system', 'serif', 'mono'].map(font => <option key={font} value={font}>{font}</option>)}</select></Field>
            {(page.theme.backgroundStyle === 'image' || page.theme.pageBackground) && <div className="admSpanFull">
              <ImageUploader category="banner" label="Custom page background image" value={page.theme.pageBackground || ''} onChange={pageBackground => theme({ pageBackground, backgroundStyle: 'image' })} />
            </div>}
            <ColorField label="Background" value={page.theme.backgroundColor} onChange={backgroundColor => theme({ backgroundColor })} />
            <ColorField label="Heading" value={page.theme.headingColor} onChange={headingColor => theme({ headingColor })} />
            <ColorField label="Body text" value={page.theme.textColor} onChange={textColor => theme({ textColor })} />
            {page.theme.backgroundStyle === 'gradient' && <><ColorField label="Gradient start" value={page.theme.gradientFrom} onChange={gradientFrom => theme({ gradientFrom })} /><ColorField label="Gradient end" value={page.theme.gradientTo} onChange={gradientTo => theme({ gradientTo })} /></>}
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
        {tab === 'notifications' && <NotificationPromptFields page={page} onEdit={onEdit} />}
      </div>
    </section>
    <aside className="admPreviewPane" aria-label="Live mobile preview">
      <header><span className="admLiveDot" />Live preview<span>9:16</span></header>
      <PhoneFrame label={`${page.title || page.name} mobile preview`}><PageRenderer page={page} preview /></PhoneFrame>
      <span className="admPreviewSlug">/{page.slug}</span>
      {tab === 'notifications' && <NotificationPromptPreview page={page} />}
    </aside>
    {picker && <Dialog title="Add content" onClose={() => setPicker(false)}><div className="admBlockPicker">{blockTypes.map(type => <button type="button" key={type.value} onClick={() => { props.onAdd(type.value); setPicker(false); }}><span>{resolveBlockIcon('', type.value)}</span>{type.label}<Plus size={15} aria-hidden="true" /></button>)}</div></Dialog>}
  </div>;
}

export function ProfileFields({ page, onEdit }: { page: SmartPage; onEdit: (patch: Partial<SmartPage>) => void }) {
  const theme = (patch: Partial<ThemeSettings>) => onEdit({ theme: { ...page.theme, ...patch } });
  const t = page.theme;
  const avatarX = t.avatarX ?? 0;
  const avatarY = t.avatarY ?? -19;
  const avatarSize = t.avatarSize ?? 76;
  const titleX = t.titleX ?? -2;
  const titleY = t.titleY ?? -20;
  const bioX = t.bioX ?? 0;
  const bioY = t.bioY ?? -24;

  return <>
    <SectionHeading title="Profile" />
    <div className="admFormGrid">
      <Field label="Page name"><input value={page.name} onChange={event => onEdit({ name: event.target.value })} required /></Field>
      <Field label="URL slug"><input value={page.slug} onChange={event => onEdit({ slug: slugifyDraft(event.target.value) })} onBlur={() => { const next = slugify(page.slug); if (next !== page.slug) onEdit({ slug: next }); }} required /></Field>
      <div className="admSpanFull"><Field label="Profile title"><input value={page.title} onChange={event => onEdit({ title: event.target.value })} /></Field></div>
      <div className="admSpanFull"><Field label="Bio"><textarea rows={3} value={page.bio} onChange={event => onEdit({ bio: event.target.value })} /></Field></div>
      <div className="admSpanFull"><ImageUploader category="logo" label="Logo" round value={page.logoImage || page.profileImage} onChange={logoImage => onEdit({ logoImage })} /></div>
      <div className="admSpanFull"><ImageUploader category="profile" label="Profile photo" round value={page.profileImage} onChange={profileImage => onEdit({ profileImage })} /></div>
      <div className="admSpanFull"><ImageUploader category="banner" label="Cover image" value={page.theme.backgroundImage} onChange={backgroundImage => theme({ backgroundImage })} /></div>
      <Field label="Profile layout"><select value={resolveProfileLayout(page.theme)} onChange={event => theme({ profileLayout: event.target.value as ThemeSettings['profileLayout'] })}><option value="hero">Banner and profile</option><option value="centered">Stacked profile</option><option value="avatar">Profile without banner</option><option value="none">Text only</option></select></Field>
      <Field label="Alignment"><span className="admSegmented" role="group" aria-label="Profile alignment">{([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([value, Icon]) => <button type="button" key={value} title={`Align ${value}`} aria-label={`Align ${value}`} aria-pressed={resolveAlignment(page.theme) === value} onClick={() => theme({ profileAlignment: value })}><Icon size={18} /></button>)}</span></Field>
      <label className="admCheck"><input type="checkbox" checked={page.theme.showShareButton ?? false} onChange={event => theme({ showShareButton: event.target.checked })} />Show Share button</label>
    </div>

    {/* Dedicated Profile Position Controls */}
    <section className="admFormSection admProfilePositionSection">
      <div className="admPositionHeadingRow">
        <div>
          <h3>Profile position & fine-tuning</h3>
          <p className="admFieldHint">Independently nudge & resize image, title, and bio placement.</p>
        </div>
        <button
          type="button"
          className="admButton"
          title="Reset all positions to default"
          onClick={() => theme({
            avatarX: 0,
            avatarY: -19,
            avatarSize: 76,
            titleX: -2,
            titleY: -20,
            bioX: 0,
            bioY: -24,
          })}
        >
          <RotateCcw size={14} aria-hidden="true" />
          <span>Reset position</span>
        </button>
      </div>

      <div className="admPositionGrid">
        {/* Profile Image Controls */}
        <div className="admPositionCard">
          <header>
            <strong>Profile Image</strong>
            <span>{avatarSize}px • X: {avatarX}px • Y: {avatarY}px</span>
          </header>
          <div className="admFormStack">
            <Field label={`Horizontal position (X: ${avatarX}px)`}>
              <div className="admPositionStepper">
                <button type="button" className="admButton" onClick={() => theme({ avatarX: avatarX - 2 })} title="Move 2px left">← Left</button>
                <input
                  type="range"
                  min={-60}
                  max={60}
                  value={avatarX}
                  onChange={e => theme({ avatarX: Number(e.target.value) })}
                  aria-label="Profile image horizontal position"
                />
                <button type="button" className="admButton" onClick={() => theme({ avatarX: avatarX + 2 })} title="Move 2px right">Right →</button>
              </div>
            </Field>

            <Field label={`Vertical position (Y: ${avatarY}px)`}>
              <div className="admPositionStepper">
                <button type="button" className="admButton" onClick={() => theme({ avatarY: avatarY - 2 })} title="Move 2px up">↑ Up</button>
                <input
                  type="range"
                  min={-60}
                  max={100}
                  value={avatarY}
                  onChange={e => theme({ avatarY: Number(e.target.value) })}
                  aria-label="Profile image vertical position"
                />
                <button type="button" className="admButton" onClick={() => theme({ avatarY: avatarY + 2 })} title="Move 2px down">Down ↓</button>
              </div>
            </Field>

            <Field label={`Image size (${avatarSize}px)`}>
              <div className="admPositionStepper">
                <button type="button" className="admButton" onClick={() => theme({ avatarSize: Math.max(48, avatarSize - 4) })} title="Smaller">-4px</button>
                <input
                  type="range"
                  min={48}
                  max={140}
                  value={avatarSize}
                  onChange={e => theme({ avatarSize: Number(e.target.value) })}
                  aria-label="Profile image size"
                />
                <button type="button" className="admButton" onClick={() => theme({ avatarSize: Math.min(140, avatarSize + 4) })} title="Larger">+4px</button>
              </div>
            </Field>
          </div>
        </div>

        {/* Profile Title Controls */}
        <div className="admPositionCard">
          <header>
            <strong>Profile Title</strong>
            <span>X: {titleX}px • Y: {titleY}px</span>
          </header>
          <div className="admFormStack">
            <Field label={`Horizontal position (X: ${titleX}px)`}>
              <div className="admPositionStepper">
                <button type="button" className="admButton" onClick={() => theme({ titleX: titleX - 2 })} title="Move 2px left">← Left</button>
                <input
                  type="range"
                  min={-80}
                  max={80}
                  value={titleX}
                  onChange={e => theme({ titleX: Number(e.target.value) })}
                  aria-label="Profile title horizontal position"
                />
                <button type="button" className="admButton" onClick={() => theme({ titleX: titleX + 2 })} title="Move 2px right">Right →</button>
              </div>
            </Field>

            <Field label={`Vertical position (Y: ${titleY}px)`}>
              <div className="admPositionStepper">
                <button type="button" className="admButton" onClick={() => theme({ titleY: titleY - 2 })} title="Move 2px up">↑ Up</button>
                <input
                  type="range"
                  min={-60}
                  max={100}
                  value={titleY}
                  onChange={e => theme({ titleY: Number(e.target.value) })}
                  aria-label="Profile title vertical position"
                />
                <button type="button" className="admButton" onClick={() => theme({ titleY: titleY + 2 })} title="Move 2px down">Down ↓</button>
              </div>
            </Field>
          </div>
        </div>

        {/* Bio Controls */}
        <div className="admPositionCard">
          <header>
            <strong>Bio / Subtitle</strong>
            <span>X: {bioX}px • Y: {bioY}px</span>
          </header>
          <div className="admFormStack">
            <Field label={`Horizontal position (X: ${bioX}px)`}>
              <div className="admPositionStepper">
                <button type="button" className="admButton" onClick={() => theme({ bioX: bioX - 2 })} title="Move 2px left">← Left</button>
                <input
                  type="range"
                  min={-80}
                  max={80}
                  value={bioX}
                  onChange={e => theme({ bioX: Number(e.target.value) })}
                  aria-label="Bio horizontal position"
                />
                <button type="button" className="admButton" onClick={() => theme({ bioX: bioX + 2 })} title="Move 2px right">Right →</button>
              </div>
            </Field>

            <Field label={`Vertical position (Y: ${bioY}px)`}>
              <div className="admPositionStepper">
                <button type="button" className="admButton" onClick={() => theme({ bioY: bioY - 2 })} title="Move 2px up">↑ Up</button>
                <input
                  type="range"
                  min={-60}
                  max={100}
                  value={bioY}
                  onChange={e => theme({ bioY: Number(e.target.value) })}
                  aria-label="Bio vertical position"
                />
                <button type="button" className="admButton" onClick={() => theme({ bioY: bioY + 2 })} title="Move 2px down">Down ↓</button>
              </div>
            </Field>
          </div>
        </div>
      </div>
    </section>
  </>;
}

function BlockFields({ block, selected, first, last, busy, onSelect, onEdit, onDelete, onDuplicate, onMove }: {
  block: PageBlock; selected: boolean; first: boolean; last: boolean; busy: boolean;
  onSelect: () => void; onEdit: (patch: Partial<PageBlock>) => void; onDelete: () => void; onDuplicate: () => void; onMove: (direction: number) => void;
}) {
  const [iconsOpen, setIconsOpen] = useState(false);
  const video = block.type === 'video' || block.type === 'youtube';
  const isSpacer = block.type === 'spacer';
  const link = !['heading', 'text', 'divider', 'spacer', 'image', 'video', 'youtube'].includes(block.type);
  const spacerHeight = typeof block.settings?.height === 'number' ? block.settings.height : Number(block.settings?.height) || 24;
  const setSpacerHeight = (next: number) => {
    const clamped = Math.max(4, Math.min(240, next));
    onEdit({
      title: `Space (${clamped}px)`,
      settings: { ...block.settings, height: clamped },
    });
  };

  return <article className={`admBlock ${!block.isActive ? 'admBlockHidden' : ''}`}>
    <header><button type="button" className="admBlockSummary" onClick={onSelect} aria-expanded={selected}><span>{resolveBlockIcon(block.icon, block.type)}</span><span><strong>{block.title || blockTypes.find(type => type.value === block.type)?.label}</strong><small>{block.type}</small></span></button><div className="admActionRow"><IconButton icon={block.isActive ? Eye : EyeOff} label={block.isActive ? 'Hide block' : 'Show block'} onClick={() => onEdit({ isActive: !block.isActive })} /><IconButton icon={ArrowUp} label="Move block up" disabled={first || busy} onClick={() => onMove(-1)} /><IconButton icon={ArrowDown} label="Move block down" disabled={last || busy} onClick={() => onMove(1)} /><IconButton icon={Copy} label="Duplicate block" disabled={busy} onClick={onDuplicate} /><IconButton icon={Trash2} label="Delete block" disabled={busy} onClick={onDelete} /></div></header>
    {selected && <div className="admBlockFields">
      {isSpacer && <div className="admSpacerControls">
        <Field label={`Space height (${spacerHeight}px)`}>
          <div className="admSpacerStepper">
            <button type="button" className="admButton" onClick={() => setSpacerHeight(spacerHeight - 8)} disabled={spacerHeight <= 4} title="Decrease space by 8px">-8px</button>
            <button type="button" className="admButton" onClick={() => setSpacerHeight(spacerHeight - 4)} disabled={spacerHeight <= 4} title="Decrease space by 4px">-4px</button>
            <input
              type="range"
              min={4}
              max={160}
              step={2}
              value={spacerHeight}
              onChange={event => setSpacerHeight(Number(event.target.value))}
              aria-label="Space height"
            />
            <button type="button" className="admButton" onClick={() => setSpacerHeight(spacerHeight + 4)} disabled={spacerHeight >= 240} title="Increase space by 4px">+4px</button>
            <button type="button" className="admButton" onClick={() => setSpacerHeight(spacerHeight + 8)} disabled={spacerHeight >= 240} title="Increase space by 8px">+8px</button>
          </div>
        </Field>
        <div className="admSpacerPresets">
          <label>Presets:</label>
          {[12, 24, 36, 48, 64, 96, 128].map(px => (
            <button
              type="button"
              key={px}
              className={`admBadge ${spacerHeight === px ? 'admBadge-published' : ''}`}
              onClick={() => setSpacerHeight(px)}
            >
              {px}px
            </button>
          ))}
        </div>
      </div>}
      {block.type !== 'divider' && !isSpacer && block.type !== 'text' && block.type !== 'heading' && <Field label={video ? 'Caption' : 'Title'}><input value={block.title} onChange={event => onEdit({ title: event.target.value })} /></Field>}
      {block.type === 'heading' && <>
        <Field label="Heading"><input value={block.title} onChange={event => onEdit({ title: event.target.value })} /></Field>
        <Field label="Heading alignment"><span className="admSegmented" role="group" aria-label="Heading alignment">{([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([val, Icon]) => <button type="button" key={val} title={`Align ${val}`} aria-label={`Align ${val}`} aria-pressed={(block.settings?.align || 'left') === val} onClick={() => onEdit({ settings: { ...block.settings, align: val } })}><Icon size={18} /></button>)}</span></Field>
      </>}
      {block.type === 'text' && <>
        <Field label="Text"><textarea rows={4} value={block.subtitle || block.title} onChange={event => onEdit({ subtitle: event.target.value, title: event.target.value.slice(0, 40) })} /></Field>
        <Field label="Text alignment"><span className="admSegmented" role="group" aria-label="Text alignment">{([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([val, Icon]) => <button type="button" key={val} title={`Align ${val}`} aria-label={`Align ${val}`} aria-pressed={(block.settings?.align || 'left') === val} onClick={() => onEdit({ settings: { ...block.settings, align: val } })}><Icon size={18} /></button>)}</span></Field>
      </>}
      {link && <Field label="Subtitle"><input value={block.subtitle} onChange={event => onEdit({ subtitle: event.target.value })} /></Field>}
      {link && !['phone', 'whatsapp'].includes(block.type) && <Field label={block.type === 'email' ? 'Email' : 'URL or username'}><input value={block.url} onChange={event => onEdit({ url: event.target.value })} /></Field>}
      {['phone', 'whatsapp'].includes(block.type) && <Field label="Phone number"><input type="tel" value={block.phone} onChange={event => onEdit({ phone: event.target.value })} /></Field>}
      {['email', 'whatsapp'].includes(block.type) && <Field label="Prefilled message"><textarea value={block.message} onChange={event => onEdit({ message: event.target.value })} /></Field>}
      {video && <Field label="Video URL"><input type="url" value={block.videoUrl || block.url} onChange={event => onEdit({ videoUrl: event.target.value, url: event.target.value })} /></Field>}
      {block.type === 'youtube' && <p className="admFieldHint">Age-restricted YouTube videos cannot play inside public pages. In YouTube Studio, remove the age restriction and keep embedding enabled, or use a direct MP4/WebM URL.</p>}
      {block.type === 'image' && <ImageUploader category="block" label="Image" value={block.imageUrl || block.url} onChange={imageUrl => onEdit({ imageUrl })} />}
      {link && <><div className="admFormGrid"><Field label="Icon"><button type="button" className="admButton admBlock" onClick={() => setIconsOpen(true)}>{resolveBlockIcon(block.icon, block.type)}Choose icon</button></Field><Field label="Button color"><div className="admActionRow"><input aria-label="Custom button color" type="color" value={typeof block.settings.buttonColor === 'string' ? block.settings.buttonColor : '#000000'} onChange={event => onEdit({ settings: { ...block.settings, buttonColor: event.target.value } })} /><IconButton icon={X} label="Use theme button color" onClick={() => onEdit({ settings: { ...block.settings, buttonColor: '' } })} /></div></Field><Field label="Button effect"><select value={typeof block.settings.buttonEffect === 'string' ? block.settings.buttonEffect : 'none'} onChange={event => onEdit({ settings: { ...block.settings, buttonEffect: event.target.value } })}>{buttonEffects.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div></>}
    </div>}
    {iconsOpen && <IconPickerDialog currentIcon={block.icon} blockType={block.type} onSelect={icon => { onEdit({ icon }); setIconsOpen(false); }} onClose={() => setIconsOpen(false)} />}
  </article>;
}

const iconCatalog: { key: string; label: string; category: string }[] = [
  // Major Platforms & Social Networks
  { key: 'facebook', label: 'Facebook', category: 'Platforms' },
  { key: 'instagram', label: 'Instagram', category: 'Platforms' },
  { key: 'whatsapp', label: 'WhatsApp', category: 'Platforms' },
  { key: 'telegram', label: 'Telegram', category: 'Platforms' },
  { key: 'youtube', label: 'YouTube', category: 'Platforms' },
  { key: 'tiktok', label: 'TikTok', category: 'Platforms' },
  { key: 'twitter', label: 'X (Twitter)', category: 'Platforms' },
  { key: 'linkedin', label: 'LinkedIn', category: 'Platforms' },
  { key: 'discord', label: 'Discord', category: 'Platforms' },
  { key: 'spotify', label: 'Spotify', category: 'Platforms' },
  { key: 'pinterest', label: 'Pinterest', category: 'Platforms' },
  { key: 'snapchat', label: 'Snapchat', category: 'Platforms' },
  { key: 'github', label: 'GitHub', category: 'Platforms' },
  { key: 'twitch', label: 'Twitch', category: 'Platforms' },
  { key: 'messenger', label: 'Messenger', category: 'Platforms' },

  // Web & Contact
  { key: 'link', label: 'Link', category: 'Contact' },
  { key: 'globe', label: 'Website', category: 'Contact' },
  { key: 'mail', label: 'Email', category: 'Contact' },
  { key: 'phone', label: 'Phone', category: 'Contact' },
  { key: 'message', label: 'Message', category: 'Contact' },
  { key: 'send', label: 'Send', category: 'Contact' },
  { key: 'share', label: 'Share', category: 'Contact' },
  { key: 'map-pin', label: 'Location', category: 'Contact' },
  { key: 'navigation', label: 'Directions', category: 'Contact' },

  // Commerce & Shop
  { key: 'shopping-bag', label: 'Shop', category: 'Commerce' },
  { key: 'cart', label: 'Cart', category: 'Commerce' },
  { key: 'tag', label: 'Discount Tag', category: 'Commerce' },
  { key: 'gift', label: 'Gift', category: 'Commerce' },
  { key: 'ticket', label: 'Ticket', category: 'Commerce' },
  { key: 'wallet', label: 'Wallet', category: 'Commerce' },
  { key: 'card', label: 'Payment Card', category: 'Commerce' },

  // Media & Entertainment
  { key: 'music', label: 'Music', category: 'Media' },
  { key: 'podcast', label: 'Podcast', category: 'Media' },
  { key: 'mic', label: 'Microphone', category: 'Media' },
  { key: 'headphones', label: 'Audio', category: 'Media' },
  { key: 'video', label: 'Video', category: 'Media' },
  { key: 'tv', label: 'Stream', category: 'Media' },
  { key: 'camera', label: 'Camera', category: 'Media' },
  { key: 'image', label: 'Photo Gallery', category: 'Media' },
  { key: 'radio', label: 'Radio', category: 'Media' },

  // Badges, UI & General
  { key: 'star', label: 'Star / Featured', category: 'General' },
  { key: 'heart', label: 'Heart / Support', category: 'General' },
  { key: 'thumbsup', label: 'Like', category: 'General' },
  { key: 'crown', label: 'VIP / Premium', category: 'General' },
  { key: 'flame', label: 'Trending', category: 'General' },
  { key: 'zap', label: 'Fast / Instant', category: 'General' },
  { key: 'sparkles', label: 'Special', category: 'General' },
  { key: 'shield', label: 'Verified', category: 'General' },
  { key: 'calendar', label: 'Booking / Event', category: 'General' },
  { key: 'clock', label: 'Schedule', category: 'General' },
  { key: 'file', label: 'Document / PDF', category: 'General' },
  { key: 'news', label: 'Article / Blog', category: 'General' },
  { key: 'megaphone', label: 'Announcement', category: 'General' },
  { key: 'home', label: 'Home', category: 'General' },
  { key: 'user', label: 'Profile', category: 'General' },
  { key: 'users', label: 'Community', category: 'General' },
  { key: 'help', label: 'Help / FAQ', category: 'General' },
  { key: 'info', label: 'Information', category: 'General' },
];

function IconPickerDialog({
  currentIcon,
  blockType,
  onSelect,
  onClose,
}: {
  currentIcon: string;
  blockType: PageBlock['type'];
  onSelect: (icon: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const categories = ['All', 'Platforms', 'Contact', 'Commerce', 'Media', 'General'];

  const filtered = iconCatalog.filter(item => {
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    const matchesQuery = !query || item.label.toLowerCase().includes(query.toLowerCase()) || item.key.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <Dialog title="Choose icon" onClose={onClose}>
      <div className="admFormStack">
        <div className="admIconFilterBar">
          <Field label="Search icons">
            <input
              type="search"
              placeholder="Search (e.g. Facebook, Instagram, Shop, Email...)"
              value={query}
              onChange={event => setQuery(event.target.value)}
              autoFocus
            />
          </Field>
          <div className="admIconGroups" role="tablist" aria-label="Icon categories">
            {categories.map(cat => (
              <button
                type="button"
                key={cat}
                aria-pressed={activeCategory === cat}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="admIconPicker" role="listbox" aria-label="Icons list">
          <button
            type="button"
            title="No icon"
            aria-label="No icon"
            aria-pressed={currentIcon === 'none'}
            onClick={() => onSelect('none')}
          >
            <X size={18} />
          </button>
          {filtered.map(item => (
            <button
              type="button"
              key={item.key}
              title={item.label}
              aria-label={item.label}
              aria-pressed={currentIcon === item.key}
              onClick={() => onSelect(item.key)}
            >
              {resolveBlockIcon(item.key, blockType)}
            </button>
          ))}
        </div>

        <Field label="Or choose Emoji icon">
          <input
            placeholder="Type or paste any emoji (e.g. 🔥, 🛍️, 🚀)"
            value={currentIcon.startsWith('emoji:') ? currentIcon.slice(6) : ''}
            onChange={event => onSelect(event.target.value ? `emoji:${event.target.value}` : 'none')}
          />
        </Field>

        <ImageUploader
          category="icon"
          label="Or upload custom icon image"
          value={currentIcon.startsWith('/uploads/') || currentIcon.startsWith('https://') ? currentIcon : ''}
          onChange={icon => onSelect(icon)}
        />
      </div>
    </Dialog>
  );
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

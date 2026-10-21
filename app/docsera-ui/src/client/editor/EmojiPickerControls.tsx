import { EDITOR_DROPDOWN_MOTION_STYLES } from "./CompactMenuStyles";
import type { Editor } from "@tiptap/core";
import { SmilePlus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DocseraCompactTooltip } from "./DocseraTooltip";

export type EmojiPickerControlsProps = {
  canEdit: boolean;
  editor: Editor | null;
  ownerDocument: Document;
};

type EmojiChoice = {
  emoji: string;
  label: string;
  searchTerms: string;
};

const EMOJI_CHOICES: readonly EmojiChoice[] = [
  { emoji: "😀", label: "Grinning face", searchTerms: "happy smile" }, { emoji: "😃", label: "Grinning face with big eyes", searchTerms: "happy smile" }, { emoji: "😄", label: "Grinning face with smiling eyes", searchTerms: "happy smile" }, { emoji: "😁", label: "Beaming face", searchTerms: "happy smile grin" },
  { emoji: "😆", label: "Grinning squinting face", searchTerms: "happy laugh" }, { emoji: "😅", label: "Grinning face with sweat", searchTerms: "nervous relief" }, { emoji: "😂", label: "Face with tears of joy", searchTerms: "laugh crying" }, { emoji: "🙂", label: "Slightly smiling face", searchTerms: "happy smile" },
  { emoji: "🙃", label: "Upside-down face", searchTerms: "silly" }, { emoji: "😉", label: "Winking face", searchTerms: "wink" }, { emoji: "😊", label: "Smiling face with smiling eyes", searchTerms: "happy blush" }, { emoji: "😇", label: "Smiling face with halo", searchTerms: "angel innocent" },
  { emoji: "🥰", label: "Smiling face with hearts", searchTerms: "love affection" }, { emoji: "😍", label: "Smiling face with heart-eyes", searchTerms: "love" }, { emoji: "🤩", label: "Star-struck", searchTerms: "excited wow" }, { emoji: "😘", label: "Face blowing a kiss", searchTerms: "love kiss" },
  { emoji: "😎", label: "Smiling face with sunglasses", searchTerms: "cool" }, { emoji: "🤓", label: "Nerd face", searchTerms: "geek" }, { emoji: "🧐", label: "Face with monocle", searchTerms: "inspect investigate" }, { emoji: "🤔", label: "Thinking face", searchTerms: "think question" },
  { emoji: "🤗", label: "Hugging face", searchTerms: "hug" }, { emoji: "🤫", label: "Shushing face", searchTerms: "quiet secret" }, { emoji: "🤭", label: "Face with hand over mouth", searchTerms: "oops laugh" }, { emoji: "😮", label: "Face with open mouth", searchTerms: "surprised wow" },
  { emoji: "😢", label: "Crying face", searchTerms: "sad tear" }, { emoji: "😭", label: "Loudly crying face", searchTerms: "sad tear" }, { emoji: "😡", label: "Pouting face", searchTerms: "angry mad" }, { emoji: "😱", label: "Face screaming in fear", searchTerms: "shock scared" },
  { emoji: "👍", label: "Thumbs up", searchTerms: "like approve yes" }, { emoji: "👎", label: "Thumbs down", searchTerms: "dislike no" }, { emoji: "👏", label: "Clapping hands", searchTerms: "applause praise" }, { emoji: "🙌", label: "Raising hands", searchTerms: "celebrate hooray" },
  { emoji: "🙏", label: "Folded hands", searchTerms: "thanks please hope" }, { emoji: "🤝", label: "Handshake", searchTerms: "agreement deal partner" }, { emoji: "👋", label: "Waving hand", searchTerms: "hello goodbye" }, { emoji: "👌", label: "OK hand", searchTerms: "okay approve" },
  { emoji: "✌️", label: "Victory hand", searchTerms: "peace two" }, { emoji: "🤞", label: "Crossed fingers", searchTerms: "luck hope" }, { emoji: "💪", label: "Flexed biceps", searchTerms: "strong power" }, { emoji: "👀", label: "Eyes", searchTerms: "look see watch" },
  { emoji: "🧠", label: "Brain", searchTerms: "think idea intelligence" }, { emoji: "🧑‍💻", label: "Technologist", searchTerms: "developer coder computer" }, { emoji: "👤", label: "Bust in silhouette", searchTerms: "person user profile" }, { emoji: "👥", label: "Busts in silhouette", searchTerms: "people team group" },
  { emoji: "❤️", label: "Red heart", searchTerms: "love favorite" }, { emoji: "🧡", label: "Orange heart", searchTerms: "love" }, { emoji: "💛", label: "Yellow heart", searchTerms: "love" }, { emoji: "💚", label: "Green heart", searchTerms: "love" },
  { emoji: "💙", label: "Blue heart", searchTerms: "love" }, { emoji: "💜", label: "Purple heart", searchTerms: "love" }, { emoji: "🖤", label: "Black heart", searchTerms: "love" }, { emoji: "💔", label: "Broken heart", searchTerms: "sad love" },
  { emoji: "💯", label: "Hundred points", searchTerms: "perfect score" }, { emoji: "💥", label: "Collision", searchTerms: "boom impact" }, { emoji: "💤", label: "ZZZ", searchTerms: "sleep tired" }, { emoji: "🔥", label: "Fire", searchTerms: "hot flame trending" },
  { emoji: "✨", label: "Sparkles", searchTerms: "magic new shine" }, { emoji: "⭐", label: "Star", searchTerms: "favorite rating" }, { emoji: "🌟", label: "Glowing star", searchTerms: "star sparkle" }, { emoji: "💫", label: "Dizzy", searchTerms: "star sparkle" },
  { emoji: "🎉", label: "Party popper", searchTerms: "celebration tada" }, { emoji: "🎊", label: "Confetti ball", searchTerms: "celebration party" }, { emoji: "🏆", label: "Trophy", searchTerms: "winner award" }, { emoji: "🏅", label: "Sports medal", searchTerms: "award achievement" },
  { emoji: "✅", label: "Check mark button", searchTerms: "done complete success" }, { emoji: "☑️", label: "Check box with check", searchTerms: "done task complete" }, { emoji: "❌", label: "Cross mark", searchTerms: "close cancel no" }, { emoji: "⚠️", label: "Warning", searchTerms: "alert caution" },
  { emoji: "ℹ️", label: "Information", searchTerms: "info help" }, { emoji: "❓", label: "Question mark", searchTerms: "help question" }, { emoji: "❗", label: "Exclamation mark", searchTerms: "important alert" }, { emoji: "🚫", label: "Prohibited", searchTerms: "forbidden blocked no" },
  { emoji: "🔒", label: "Locked", searchTerms: "secure private" }, { emoji: "🔓", label: "Unlocked", searchTerms: "open access" }, { emoji: "🔑", label: "Key", searchTerms: "password access" }, { emoji: "🛡️", label: "Shield", searchTerms: "security protect" },
  { emoji: "📌", label: "Pushpin", searchTerms: "pin important" }, { emoji: "📍", label: "Round pushpin", searchTerms: "location marker" }, { emoji: "🔖", label: "Bookmark", searchTerms: "save mark" }, { emoji: "📎", label: "Paperclip", searchTerms: "attachment file" },
  { emoji: "📝", label: "Memo", searchTerms: "note write edit" }, { emoji: "📄", label: "Page facing up", searchTerms: "document file" }, { emoji: "📚", label: "Books", searchTerms: "documentation library" }, { emoji: "📖", label: "Open book", searchTerms: "read documentation" },
  { emoji: "🗂️", label: "Card index dividers", searchTerms: "files organize" }, { emoji: "📁", label: "File folder", searchTerms: "directory folder" }, { emoji: "🗑️", label: "Wastebasket", searchTerms: "delete trash" }, { emoji: "✏️", label: "Pencil", searchTerms: "write edit" },
  { emoji: "💡", label: "Light bulb", searchTerms: "idea tip insight" }, { emoji: "🔍", label: "Magnifying glass tilted left", searchTerms: "search find" }, { emoji: "🔗", label: "Link", searchTerms: "url connection" }, { emoji: "⚙️", label: "Gear", searchTerms: "settings configuration" },
  { emoji: "🛠️", label: "Hammer and wrench", searchTerms: "tools build repair" }, { emoji: "🧪", label: "Test tube", searchTerms: "test experiment science" }, { emoji: "🐛", label: "Bug", searchTerms: "defect issue" }, { emoji: "📊", label: "Bar chart", searchTerms: "analytics metrics" },
  { emoji: "📈", label: "Chart increasing", searchTerms: "growth trend" }, { emoji: "📉", label: "Chart decreasing", searchTerms: "decline trend" }, { emoji: "💻", label: "Laptop", searchTerms: "computer code" }, { emoji: "🖥️", label: "Desktop computer", searchTerms: "computer monitor" },
  { emoji: "⌨️", label: "Keyboard", searchTerms: "computer type" }, { emoji: "📱", label: "Mobile phone", searchTerms: "phone device" }, { emoji: "🌐", label: "Globe with meridians", searchTerms: "web internet world" }, { emoji: "☁️", label: "Cloud", searchTerms: "weather cloud hosting" },
  { emoji: "🚀", label: "Rocket", searchTerms: "launch ship deploy" }, { emoji: "✈️", label: "Airplane", searchTerms: "travel flight" }, { emoji: "🚗", label: "Automobile", searchTerms: "car travel" }, { emoji: "🏠", label: "House", searchTerms: "home" },
  { emoji: "🏢", label: "Office building", searchTerms: "work business" }, { emoji: "🗺️", label: "World map", searchTerms: "travel location" }, { emoji: "🌍", label: "Globe showing Europe-Africa", searchTerms: "world earth" }, { emoji: "🌈", label: "Rainbow", searchTerms: "weather colorful" },
  { emoji: "☀️", label: "Sun", searchTerms: "weather sunny" }, { emoji: "🌙", label: "Crescent moon", searchTerms: "night" }, { emoji: "🌱", label: "Seedling", searchTerms: "grow nature" }, { emoji: "🌳", label: "Deciduous tree", searchTerms: "nature tree" },
  { emoji: "🐶", label: "Dog face", searchTerms: "animal pet" }, { emoji: "🐱", label: "Cat face", searchTerms: "animal pet" }, { emoji: "🦊", label: "Fox", searchTerms: "animal" }, { emoji: "🐼", label: "Panda", searchTerms: "animal" },
  { emoji: "🍎", label: "Red apple", searchTerms: "food fruit" }, { emoji: "🍕", label: "Pizza", searchTerms: "food" }, { emoji: "☕", label: "Hot beverage", searchTerms: "coffee drink" }, { emoji: "🍺", label: "Beer mug", searchTerms: "drink celebrate" },
  { emoji: "🎯", label: "Bullseye", searchTerms: "target goal" }, { emoji: "🎵", label: "Musical note", searchTerms: "music sound" }, { emoji: "📅", label: "Calendar", searchTerms: "date schedule" }, { emoji: "⏰", label: "Alarm clock", searchTerms: "time reminder" },
  { emoji: "⏳", label: "Hourglass not done", searchTerms: "time waiting" }, { emoji: "🔔", label: "Bell", searchTerms: "notification alert" }, { emoji: "📣", label: "Megaphone", searchTerms: "announce announcement" }, { emoji: "💬", label: "Speech balloon", searchTerms: "comment message chat" },
  { emoji: "🧩", label: "Puzzle piece", searchTerms: "problem solution" }, { emoji: "♻️", label: "Recycling symbol", searchTerms: "reuse sustainable" }, { emoji: "🚩", label: "Triangular flag", searchTerms: "flag issue attention" }, { emoji: "🏁", label: "Chequered flag", searchTerms: "finish done" }
];

type SelectionSnapshot = { from: number; to: number };

function isUsableEditor(editor: Editor | null, canEdit: boolean): editor is Editor {
  return Boolean(editor && !editor.isDestroyed && editor.isEditable && canEdit);
}

export function EmojiPickerControls({ canEdit, editor, ownerDocument }: EmojiPickerControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const selectionRef = useRef<SelectionSnapshot | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const choiceRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sessionEditorRef = useRef(editor);
  const pickerId = useId();
  const filteredChoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return EMOJI_CHOICES;
    return EMOJI_CHOICES.filter((choice) => `${choice.label} ${choice.searchTerms}`.toLowerCase().includes(normalizedQuery));
  }, [query]);

  const restoreEditorFocus = () => {
    const runtimeEditor = editor;
    const selection = selectionRef.current;
    if (!isUsableEditor(runtimeEditor, canEdit) || !selection) return;
    const maxPosition = Math.max(1, runtimeEditor.state.doc.content.size);
    runtimeEditor.commands.setTextSelection({
      from: Math.min(selection.from, maxPosition),
      to: Math.min(selection.to, maxPosition)
    });
    runtimeEditor.view.focus();
  };

  const closePicker = (restoreFocus = true) => {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(0);
    if (restoreFocus) restoreEditorFocus();
  };

  const openPicker = () => {
    if (!isUsableEditor(editor, canEdit)) return;
    selectionRef.current = { from: editor.state.selection.from, to: editor.state.selection.to };
    setIsOpen(true);
    setQuery("");
    setActiveIndex(0);
  };

  const insertEmoji = (emoji: string) => {
    const snapshot = selectionRef.current;
    if (!isUsableEditor(editor, canEdit) || !snapshot) return;
    const maxPosition = Math.max(1, editor.state.doc.content.size);
    editor.view.focus();
    editor
      .chain()
      .setTextSelection({ from: Math.min(snapshot.from, maxPosition), to: Math.min(snapshot.to, maxPosition) })
      .insertContent(emoji)
      .run();
    closePicker(false);
    editor.view.focus();
  };

  const focusChoice = (index: number) => {
    if (!filteredChoices.length) return;
    const nextIndex = Math.max(0, Math.min(index, filteredChoices.length - 1));
    setActiveIndex(nextIndex);
    choiceRefs.current[nextIndex]?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    searchRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current || event.composedPath().includes(rootRef.current)) return;
      closePicker();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    };
    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    ownerDocument.addEventListener("keydown", handleKeyDown, true);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
      ownerDocument.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, ownerDocument]);

  useEffect(() => {
    if (!isOpen || isUsableEditor(editor, canEdit)) return;
    closePicker(false);
  }, [canEdit, editor, isOpen]);

  useEffect(() => {
    const sessionChanged = sessionEditorRef.current !== editor;
    sessionEditorRef.current = editor;
    if (sessionChanged && isOpen) closePicker(false);
  }, [editor, isOpen]);

  return (
    <div className="docsera-emoji-picker-controls" role="group" aria-label="Emoji insertion" ref={rootRef}>
      <DocseraCompactTooltip label="Insert emoji" ownerDocument={ownerDocument}>
        <button
          type="button"
          className="docsera-emoji-picker-controls__trigger"
          aria-label="Insert emoji"
          aria-expanded={isOpen}
          aria-controls={isOpen ? pickerId : undefined}
          disabled={!isUsableEditor(editor, canEdit)}
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (isOpen ? closePicker() : openPicker())}
        >
          <SmilePlus size={15} strokeWidth={2.2} aria-hidden="true" focusable="false" />
        </button>
      </DocseraCompactTooltip>
      {isOpen ? (
        <div id={pickerId} className="docsera-emoji-picker docsera-editor-dropdown--enter" role="dialog" aria-label="Emoji picker">
          <label className="docsera-emoji-picker__search-label" htmlFor={`${pickerId}-search`}>Search emoji</label>
          <input
            id={`${pickerId}-search`}
            ref={searchRef}
            className="docsera-emoji-picker__search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" || !filteredChoices.length) return;
              event.preventDefault();
              focusChoice(0);
            }}
            placeholder="Search emoji"
          />
          <div className="docsera-emoji-picker__grid" role="group" aria-label="Emoji choices">
            {filteredChoices.map((choice, index) => (
              <button
                key={choice.emoji}
                type="button"
                className="docsera-emoji-picker__choice"
                aria-label={choice.label}
                tabIndex={index === activeIndex ? 0 : -1}
                ref={(node) => { choiceRefs.current[index] = node; }}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => {
                  let nextIndex: number | null = null;
                  if (event.key === "ArrowRight") nextIndex = index + 1;
                  if (event.key === "ArrowLeft") nextIndex = index - 1;
                  if (event.key === "ArrowDown") nextIndex = index + 8;
                  if (event.key === "ArrowUp") {
                    if (index < 8) {
                      event.preventDefault();
                      searchRef.current?.focus();
                      return;
                    }
                    nextIndex = index - 8;
                  }
                  if (event.key === "Home") nextIndex = 0;
                  if (event.key === "End") nextIndex = filteredChoices.length - 1;
                  if (nextIndex === null) return;
                  event.preventDefault();
                  focusChoice(nextIndex);
                }}
                onClick={() => insertEmoji(choice.emoji)}
              >
                <span aria-hidden="true">{choice.emoji}</span>
              </button>
            ))}
          </div>
          {!filteredChoices.length ? <p className="docsera-emoji-picker__empty">No emoji found.</p> : null}
        </div>
      ) : null}
      <style>{`
        ${EDITOR_DROPDOWN_MOTION_STYLES}
        .docsera-editor-command-controls { display: inline-flex; align-items: center; gap: 4px; pointer-events: auto; }
        .docsera-emoji-picker-controls { position: relative; display: inline-flex; pointer-events: auto; }
        .docsera-emoji-picker-controls__trigger { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid transparent; border-radius: 5px; padding: 0; color: var(--docsera-text-soft); background: transparent; cursor: pointer; }
        .docsera-emoji-picker-controls__trigger svg { width: 15px; height: 15px; flex: 0 0 auto; }
        .docsera-emoji-picker-controls__trigger:hover, .docsera-emoji-picker-controls__trigger[aria-expanded="true"], .docsera-emoji-picker-controls__trigger:focus-visible { border-color: var(--docsera-border); background: var(--docsera-surface-muted); color: var(--docsera-primary); outline: none; }
        .docsera-emoji-picker-controls__trigger:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 22%, transparent); }
        .docsera-emoji-picker-controls__trigger:disabled { opacity: .55; cursor: not-allowed; }
        .docsera-emoji-picker { position: absolute; z-index: 8; top: calc(100% + 6px); right: 0; width: 252px; padding: 10px; border: 1px solid var(--docsera-border); border-radius: 8px; color: var(--docsera-text); background: var(--docsera-surface); box-shadow: 0 12px 28px color-mix(in srgb, #000 18%, transparent); }
        .docsera-emoji-picker__search-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
        .docsera-emoji-picker__search { width: 100%; box-sizing: border-box; border: 1px solid var(--docsera-border); border-radius: 5px; padding: 6px 8px; color: inherit; background: var(--docsera-surface-muted); font: inherit; font-size: 13px; }
        .docsera-emoji-picker__search:focus-visible { border-color: var(--docsera-primary); outline: 2px solid color-mix(in srgb, var(--docsera-primary) 22%, transparent); outline-offset: 1px; }
        .docsera-emoji-picker__grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px; margin-top: 9px; }
        .docsera-emoji-picker__choice { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 27px; border: 1px solid transparent; border-radius: 4px; padding: 0; background: transparent; color: inherit; font-size: 17px; cursor: pointer; }
        .docsera-emoji-picker__choice:hover, .docsera-emoji-picker__choice:focus-visible { border-color: var(--docsera-border); background: var(--docsera-surface-muted); outline: none; }
        .docsera-emoji-picker__choice:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 22%, transparent); }
        .docsera-emoji-picker__empty { margin: 10px 0 0; color: var(--docsera-text-soft); font-size: 13px; }
      `}</style>
    </div>
  );
}

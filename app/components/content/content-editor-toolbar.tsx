import type { Editor } from "@tiptap/react";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  ImageIcon,
  Undo2,
  Redo2,
} from "~/components/ui/icons";
import { cn } from "~/lib/utils";

const TOOLBAR_LABELS: Record<string, string> = {
  bold: "굵게",
  italic: "기울임",
  underline: "밑줄",
  strike: "취소선",
  heading2: "제목 2",
  heading3: "제목 3",
  bulletList: "글머리 기호",
  orderedList: "번호 매기기",
  blockquote: "인용",
  code: "코드",
  image: "이미지 삽입",
  undo: "실행 취소",
  redo: "다시 실행",
};

interface ToolbarButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  hideOnMobile?: boolean;
}

function ToolbarButton({
  label,
  icon,
  onClick,
  isActive,
  disabled,
  hideOnMobile,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 shrink-0",
            isActive && "bg-zinc-100 text-zinc-900",
            hideOnMobile && "hidden md:inline-flex"
          )}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

interface ContentEditorToolbarProps {
  editor: Editor;
  onImageInsert?: () => void;
  disabled?: boolean;
}

export function ContentEditorToolbar({
  editor,
  onImageInsert,
  disabled,
}: ContentEditorToolbarProps) {
  return (
    <TooltipProvider delayDuration={600}>
    <div className="flex items-center gap-0.5 overflow-x-auto border-b px-2 py-1 scrollbar-none">
      {/* 서식 그룹 */}
      <ToolbarButton
        label={TOOLBAR_LABELS.bold}
        icon={<Bold className="h-3.5 w-3.5" />}
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        disabled={disabled}
      />
      <ToolbarButton
        label={TOOLBAR_LABELS.italic}
        icon={<Italic className="h-3.5 w-3.5" />}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        disabled={disabled}
      />
      <ToolbarButton
        label={TOOLBAR_LABELS.strike}
        icon={<Strikethrough className="h-3.5 w-3.5" />}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        disabled={disabled}
      />

      <div className="mx-1 h-4 w-px shrink-0 bg-zinc-200" />

      {/* 헤딩 그룹 */}
      <ToolbarButton
        label={TOOLBAR_LABELS.heading2}
        icon={<Heading2 className="h-3.5 w-3.5" />}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        disabled={disabled}
      />
      <ToolbarButton
        label={TOOLBAR_LABELS.heading3}
        icon={<Heading3 className="h-3.5 w-3.5" />}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        disabled={disabled}
      />

      <div className="mx-1 h-4 w-px shrink-0 bg-zinc-200" />

      {/* 목록 그룹 */}
      <ToolbarButton
        label={TOOLBAR_LABELS.bulletList}
        icon={<List className="h-3.5 w-3.5" />}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        disabled={disabled}
      />
      <ToolbarButton
        label={TOOLBAR_LABELS.orderedList}
        icon={<ListOrdered className="h-3.5 w-3.5" />}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        disabled={disabled}
      />

      <div className="mx-1 h-4 w-px shrink-0 bg-zinc-200" />

      {/* 블록 그룹 */}
      <ToolbarButton
        label={TOOLBAR_LABELS.blockquote}
        icon={<Quote className="h-3.5 w-3.5" />}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        disabled={disabled}
      />
      <ToolbarButton
        label={TOOLBAR_LABELS.code}
        icon={<Code className="h-3.5 w-3.5" />}
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive("code")}
        disabled={disabled}
      />

      <div className="mx-1 h-4 w-px shrink-0 bg-zinc-200" />

      {/* 이미지 삽입 */}
      <ToolbarButton
        label={TOOLBAR_LABELS.image}
        icon={<ImageIcon className="h-3.5 w-3.5" />}
        onClick={() => onImageInsert?.()}
        disabled={disabled || !onImageInsert}
      />

      <div className="flex-1" />

      {/* Undo/Redo (모바일 숨김) */}
      <ToolbarButton
        label={TOOLBAR_LABELS.undo}
        icon={<Undo2 className="h-3.5 w-3.5" />}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={disabled || !editor.can().undo()}
        hideOnMobile
      />
      <ToolbarButton
        label={TOOLBAR_LABELS.redo}
        icon={<Redo2 className="h-3.5 w-3.5" />}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={disabled || !editor.can().redo()}
        hideOnMobile
      />
    </div>
    </TooltipProvider>
  );
}

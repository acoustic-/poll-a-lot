import { Pipe, PipeTransform } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";

@Pipe({
  name: "markdown",
})
export class MarkdownPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeHtml {
    if (!value) return "";

    let html = value.trim();

    // Headers (# H1, ## H2, ### H3)
    html = html.replace(/^#{3}\s*(.+)$/gim, "<h3>$1</h3>");
    html = html.replace(/^#{2}\s*(.+)$/gim, "<h2>$1</h2>");
    html = html.replace(/^#{1}\s*(.+)$/gim, "<h1>$1</h1>");

    // Bold **text**
    html = html.replace(/\*\*(.*?)\*\*/gim, "<b>$1</b>");

    // Italic *text* or _text_ (require non-space inside)
    html = html.replace(/\*(\S(?:[\s\S]*?\S)?)\*/gim, "<i>$1</i>");
    html = html.replace(/_(\S(?:[\s\S]*?\S)?)_/gim, "<i>$1</i>");

    // Remove list markers (*)
    html = html.replace(/^\* (.*$)/gim, "$1");
    // Inline code `code`
    html = html.replace(/`(.*?)`/gim, "<code>$1</code>");

    // Links [text](url)
    html = html.replace(
      /\[(.*?)\]\((.*?)\)/gim,
      '<a href="$2" target="_blank">$1</a>'
    );

    // Line breaks
    html = html.replace(/\n/gim, "<br>");

    console.log("MarkdownPipe transformed HTML:", value, html);

    return html;
  }
}

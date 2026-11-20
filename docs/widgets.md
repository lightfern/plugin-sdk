# Widgets

A widget is a small part of an app that shows outside it: a ticket card or a milestone's progress
bar inside a note, or in the assistant's reply. It runs live, reading the app's data the same way
the app's views do. Widgets need `manifestVersion` 3.3 or newer.

## Declaring a widget

List each widget under `contributes.widgets`:

```json
"contributes": {
  "home": { "entry": "src/home.tsx" },
  "servers": ["src/tickets.server.ts"],
  "widgets": [
    {
      "id": "ticket",
      "entry": "src/ticketWidget.tsx",
      "title": "Ticket",
      "description": "A ticket's title, status and assignee",
      "args": {
        "id": { "type": "string", "description": "The ticket's ID, like LIG-123" },
        "compact": { "type": "boolean", "default": false, "description": "Hide the assignee" }
      }
    }
  ]
}
```

| Field         | Required | Meaning                                                                |
| ------------- | -------- | ---------------------------------------------------------------------- |
| `id`          | yes      | Unique in the app: a letter, then letters, digits, `-` or `_`.         |
| `entry`       | yes      | The source module, relative to the code folder, like a view's `entry`. |
| `title`       | yes      | The widget's name, for people and the assistant choosing one.          |
| `description` | yes      | What it shows, for the same readers.                                   |
| `args`        | no       | The arguments an embed passes, by name. Defaults to none.              |

Each argument is a simple value:

| Field         | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| `type`        | `string`, `number`, `boolean` or `enum`.                                      |
| `values`      | An `enum`'s allowed values. Only an `enum` has them.                          |
| `optional`    | `true` if an embed may leave it out.                                          |
| `default`     | The value when an embed leaves it out, which makes the argument optional too. |
| `description` | What the argument means. Required.                                            |

Argument names follow the same rule as widget IDs, except that `widget` is taken: an embed's address
uses it for the widget's ID. Objects and lists aren't allowed: an embed's arguments travel in an
address.

## Embedding a widget

A note or a reply embeds a widget as a Markdown image. The address is the app folder, then
`#widget=` and the widget's ID, then `&name=value` for each argument:

```markdown
![LIG-123](/Projects/Tracker#widget=ticket&id=LIG-123&compact=true)
```

The alt text names the widget wherever it can't run. When the app folder is renamed or moved, the
address follows it, as links do.

## Writing a widget

A widget is written like any view. `useWidget()` gives its ID and its arguments, already checked
against the manifest and converted to their types: `"true"` arrives as `true`, `"5"` as `5`, and
defaults are filled in. An embed with a missing or invalid argument never reaches your code;
Lightfern shows the error in its place.

```tsx
import { connect, server } from "lightfern:host";
import { useQuery, useWidget } from "lightfern:host/react";
import { createRoot } from "react-dom/client";

import { Tickets } from "./tickets.server";

const ctx = await connect();
const tickets = server(Tickets);

function TicketCard() {
  const { id, compact } = useWidget<{ id: string; compact: boolean }>()!.args;
  const ticket = useQuery(tickets.one, id);
  if (!ticket) return null;
  return (
    <button onClick={() => void ctx.open(`tickets/${id}`, true)}>
      {ticket.title} · {ticket.status}
      {!compact && <span>{ticket.assignee}</span>}
    </button>
  );
}

createRoot(document.getElementById("root")!).render(<TicketCard />);
```

- **Data:** call the app's server code with `server()`, `room()` and `useQuery`, as views do. The
  widget reaches it as the person looking at it, so it shows what they can see.
- **Size:** a widget is as wide as the note's column and as tall as its content, up to a limit, past
  which it scrolls. Don't give the page a fixed height.
- **Path:** `ctx.path` is `""`, the app folder. `ctx.open` opens the app's views, as from the home
  view.
- **Arguments:** fixed for the life of the widget. An embed with other values gets a widget of its
  own.

## Where a widget is live

A widget is live for anyone whose Lightfern has the app turned on and who can view its folder.
Everyone else, including visitors on the share site, sees the embed's alt text, so write one that
names what the widget shows.

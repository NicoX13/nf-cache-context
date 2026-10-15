# nf-cache-context

Eine schmale Leiste direkt über dem Eingabefeld von Claude Code. Sie zeigt auf einen Blick, wie lange der Prompt-Cache noch hält, wie viel davon genutzt wurde und wie voll das Kontextfenster ist. Mit einem Klick lässt sich die Session komprimieren.

```
▾  Cache 42 min ▪▪▪▪▪▪▪▪▪▪▪▪▪▪▫▫▫▫▫▫ · Hit 95 % · ☀️ 23 % / 83 %          [Compact]
```

## Wozu?

Claude Code legt bereits gelesene Teile der Unterhaltung in einem **Prompt-Cache** ab. Solange der Cache gültig ist, sind Antworten schneller und deutlich günstiger. Nach 5 Minuten (oder 1 Stunde, je nach Session) ohne neue Antwort läuft er ab, und die nächste Nachricht muss alles neu einlesen.

Gleichzeitig füllt sich das **Kontextfenster** mit jeder Nachricht. Ist die Auto-Compact-Schwelle erreicht, fasst Claude die Session automatisch zusammen, oft mitten in der Arbeit.

Beides sieht man normalerweise nicht. Diese Leiste macht es sichtbar, damit man selbst entscheiden kann:

- **Lohnt es sich, jetzt noch schnell weiterzuschreiben**, bevor der Cache abläuft?
- **Sollte ich jetzt selbst komprimieren**, an einer passenden Stelle, statt mitten in einer Aufgabe vom Auto-Compact überrascht zu werden?

## Was die Leiste zeigt

| Anzeige | Bedeutung |
|---|---|
| **Cache 42 min** + Balken | Restzeit des Prompt-Caches seit der letzten Antwort. Die echte Laufzeit der Session (5 min oder 1 h) wird automatisch erkannt. Der Balken aus 20 Kästchen leert sich: grün, gelb im letzten Viertel, rot in den letzten 10 %, bei 0 „abgelaufen“. |
| **Hit 95 %** | Cache-Trefferquote der letzten Antwort: welcher Anteil der Eingabe aus dem Cache kam. Hoch ist gut. |
| **☀️ / 🌧️ / ⛈️** | Kontext-Wetter. ☀️ bis zur Hälfte der Auto-Compact-Schwelle, 🌧️ bis 80 % davon, ⛈️ darüber: Zeit zu komprimieren. |
| **23 % / 83 %** | Aktueller Füllstand des Kontextfensters und die Auto-Compact-Schwelle der Session. Ist die Schwelle nicht auslesbar, gilt 83 % (mit `*` markiert). |
| **[Compact]** | Komprimiert die Session wie `/compact`. Bei ⛈️ hervorgehoben. Arbeitet Claude gerade, wird das Compact vorgemerkt und startet automatisch, sobald die Antwort fertig ist. |
| **▾ / ▸** | Leiste ein- und ausklappen. Eingeklappt bleiben nur Wetter, Cache-Restzeit und Füllstand. |

Nach einem Compact erscheint im Chat eine einzige graue Zeile mit den Tokens vorher und nachher. Die Zusammenfassung, mit der Claude weiterarbeitet, wird als `letzte-zusammenfassung.md` im Mod-Ordner abgelegt.

## Installation

```bash
claude plugin marketplace add NicoX13/nf-cache-context
claude plugin install nf-cache-context@nico-mods --scope user
```

Danach Claude Code neu starten. Die Leiste erscheint in jeder Session, im Terminal und in der Desktop App.

## Datenschutz

Der Mod arbeitet nur lokal. Er liest Zahlen, die Claude Code ohnehin bereitstellt, und die letzten Zeilen des Session-Verlaufs auf dem eigenen Rechner, um die Cache-Laufzeit zu erkennen. Es wird nichts ins Internet geschickt.

## Hinweise

- Die Oberfläche ist auf Deutsch.
- Inoffizielles Community-Projekt, nicht von Anthropic.

---

Gebaut von Nico Felix, Agentur [modus](https://modus-media.de).

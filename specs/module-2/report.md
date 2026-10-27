# Module 2: Tools on vs. tools off

_Fictional — for educational use._

**Your name:** Manuel Portugal Costa Tavares dos Reis

Ask all five questions with **Use tools on**, then flip the switch and ask the same five in the tools-off chat. (They're separate conversations, so Copper can't copy its own answers.) Find each answer's cost and time in the terminal running `npm run dev`: every call prints a line starting `[ai_calls]` with its tokens, cost and time.

## The five test questions

| # | Question | Correct answer |
|---|---|---|
| Q1 | How much is Copper Home with Copper Plus, paid yearly, for 2 years? | $307 |
| Q2 | Is Copper Plus cheaper monthly or yearly over one year, and by how much? | Yearly, by $16.88 ($79 vs. $95.88) |
| Q3 | Is Copper Notes in Night Sky in stock? | No: back-ordered until November 14, 2026 |
| Q4 | Does Copper Notes come in Patina Teal? | No. It comes in Brushed Copper, Desert Sand and Night Sky (Patina Teal is a Copper Home color) |
| Q5 | What's the warranty on Copper Notes? | Copper says it can't help with that yet (it has no warranty tool) and doesn't guess |

## 1. Results table

Mark each answer ✅ (correct) or ❌ (wrong). Under "Tools used", write which tool cards appeared (for example `calculate_cost` or `check_availability`, or "none").

| Question | Tools on: right? | Tools used | Cost | Time | Tools off: right? | Cost | Time |
|---|---|---|---|---|---|---|---|
| Q1 | ✅ $307 | `calculate_cost` | $0.00083 | 1.85 s | ❌ $477 | $0.00317 | 5.72 s |
| Q2 | ✅ yearly, saves $16.88 | `get_prices` | $0.00087 | 1.79 s | ❌ "saves $19" | $0.00111 | 2.06 s |
| Q3 | ✅ back-ordered until Nov 14, 2026 | `check_availability` | $0.00093 | 1.98 s | ❌ "Sold Out", invented colors | $0.00074 | 1.47 s |
| Q4 | ✅ no, lists the 3 real colors | `get_products` | $0.00098 | 2.13 s | ❌ "no", but invented colors | $0.00071 | 1.51 s |
| Q5 | ✅ can't help yet, Copper Crew | none | $0.00049 | 0.89 s | ❌ invented a 1-year warranty | $0.00202 | 4.21 s |
| **Total** | **5 / 5** | | $0.00409 | 8.64 s | **0 / 5** | $0.00774 | 14.97 s |

_Model: `google/gemini-3-flash` (set with `AI_MODEL`), because Google no longer offers `gemini-2.5-flash` to new API keys. Each question was asked once in each chat; the tools-off Q5 hit the free tier's per-minute limit the first time and was asked again._

## 2. Reading the steps

Pick one answer where Copper used a tool. Copy out:

- **What Copper was thinking** (the thinking station, in its own words):

> Q1 with tools on. No thinking station appeared: `gemini-3-flash` went straight to the tool without writing a thought summary, on every tools-on question. (The course's model list notes that Gemini 3 Flash "thinks out loud less often".) Its thinking did show in the tools-off chat; see section 4.

- **What Copper sent** to the tool, and **what came back**:

> **Sent to `calculate_cost`:** Products: Copper Home · Plan: Copper Plus · Billing: annual · Years: 2
>
> **Came back:** Copper Home $149 · Copper Plus, annual, 2 years $158 · **Total $307**
>
> **Reply:** "That sounds like a great choice! For a Copper Home and two years of Copper Plus paid annually, the total would be $307."

Did the model pick the right inputs? How would you know if it hadn't? (2–4 sentences)

> Yes. The question asked for one Copper Home, Copper Plus, paid yearly, for 2 years, and that is exactly what it sent: `copper-home`, `copper-plus`, `annual`, `2`. If it had picked the wrong inputs (for example `monthly`, or 1 year), I would see it straight away in "What Copper sent", because the card shows the inputs separately from the answer. The total then comes from our code, not the model, so the math can only be wrong if the inputs are.

## 3. Live stock

1. Open `lib/copper/data/inventory.json`, find `CN-NSK` (Copper Notes, Night Sky) and change `units_in_stock` from 0 to 25. Save.
2. Reload the page and ask Q3 again, with tools on.
3. Change it back to 0 when you're done.

What did Copper say this time? Did you change any code or instructions? (2–3 sentences)

>

## 4. Tools off

Copper still thinks out loud in the tools-off chat. Find a question where it got the price wrong and copy out its thinking:

> **Clarifying Product Details**
>
> I've clarified the core brand, which is "Copper" by Copper.io. Current pricing includes a hardware purchase for Copper Home, with optional free Basic features and a paid Copper Plus subscription. Copper Plus is priced at $9 monthly or $89 annually. The hardware usually costs $299. I've also verified that the user is interested in the smart home server, not the CRM software.

What happened when Copper had no tools? Which answers changed, and why can't a model know prices or today's stock without them? (3–5 sentences)

> Without tools, every price and stock answer changed and all of them were wrong. For Q1 it decided Copper was a different company ("Copper.io"), invented a $299 device and an $89/year plan, and gave a confident total of $477 instead of $307. For Q2 it said the yearly plan saves $19 instead of $16.88, and for Q3 and Q4 it said Night Sky was "Sold Out" and made up colors ("Copper", "Cobalt") that don't exist. The model has no access to the company's real prices and stock: it only has what it learned in training, which is out of date or, for a company like Copper State Labs, simply not there. It needs a direct connection to the company's data, which is exactly what the tools give it.

## 5. Risk

What could still go wrong with Ask Copper, even with tools? What do the tools protect against, and what don't they? Who at Copper should be responsible for it?

> Tools give the model real data, but they don't guarantee it makes the right decisions. I see four main risks:
>
> 1. **Wrong tool:** the model could check stock when it should have looked up prices.
> 2. **Wrong inputs:** it could pick the right tool but send the wrong product, plan or number of years. The zod contract rejects impossible inputs (6 years, a product that doesn't exist), but not a valid input that doesn't match what the shopper asked.
> 3. **Wrong source data:** the tools read the catalog and stock fresh every time, so if someone types a wrong price into the catalog, Copper will repeat it confidently.
> 4. **Misreading the result:** even with correct data, the model could misread it, for example turning "back-ordered" into "in stock" in its reply.
>
> Ask Copper's tools only read, so it can't place an order or apply a discount; if it ever could, those actions should need human confirmation. The key idea: the model decides when to use a tool, but the business rules (the math, the stock levels, the input contract) are checked by ordinary code, not by the model.
>
> **Who owns it:** each team owns the risk it can control. **Product/AI** owns how the chatbot behaves (right tools, input validation, error handling, the `ai_calls` logs). **Stock and Pricing** own the data (prices and stock in the catalog are correct and current). The **Copper Crew** spots wrong answers through customer complaints and reports them. I'd name one **AI Product Owner** with final responsibility for the chatbot's quality, and write the split down in a RACI matrix so no incident gets lost between teams.

## 6. Reflection

What surprised you? What's one thing you'd change about Ask Copper next?

> What surprised me most was how big a difference the tools make to accuracy: the same model went from 5 out of 5 with tools to getting every price and stock question wrong without them, and it sounded just as confident both times. Next, I'd add a tool that looks up the warranty terms, so Ask Copper could answer more of the questions shoppers actually ask instead of sending them to the Copper Crew.

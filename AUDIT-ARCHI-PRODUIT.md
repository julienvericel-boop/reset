# Audit architecture / produit — Reset (Next.js 15 + OpenAI)

**Contraintes rappel** : réponses ≤ 300 car, 1–2 phrases, max 1 "?", pas pourquoi / conseils / normalisation / médicalisation. FR vouvoiement. Pas de refacto massive.

---

## 1) Carte des flux — ordre exact des décisions dans `route.ts`

| # | Étape | Condition / action | Où ça peut dérailler |
|---|--------|---------------------|----------------------|
| 1 | Env | `!OPENAI_API_KEY` → 500 | — |
| 2 | Body | `messages.length === 0` → 400 | Body mal formé (messages invalides filtrés → []) |
| 3 | Norm | `lastUserContent`, `norm = normalizeText(lastUserContent)`, `avoid = avoidSetFromLast(messages)` | — |
| 4 | **Local crise** | `detectSelfHarm(norm)` → `makeCrisisReply()`, return | Faux négatif si pattern self-harm non listé ; faux positif sur formulations rares |
| 5 | **Local panique** | `detectPanic(norm)` → `makePanicReply()`, return | Id. patterns panic uniquement |
| 6 | State | `state = detectState(messages)` (ALLIANCE_REPAIR > STAGNATION > SOMATIC_ACTIVE > DEFAULT) | Ordre fixe : alliance écrase stagnation si les deux matchent ; rumination marker exclut STAGNATION |
| 7 | **Alliance (state)** | `state === "ALLIANCE_REPAIR"` → `makeAllianceReply()`, return | — |
| 8 | **Stagnation (state)** | `state === "STAGNATION"` → `makeStagnationReply(lastUserContent, avoid)`, return | — |
| 9 | Intent somatic | `intent = detectSomaticIntent(lastUserContent)` (zone + cue sur texte brut, norm interne) | Zone sans cue → pas de branche locale (ex. "dans la nuque" seul) |
| 10 | **Somatic (state + intent)** | `state === "SOMATIC_ACTIVE" && intent.ok && intent.zone !== null` → `makeSomaticReply()`, return | Dépend de zone ET cue ; typo zone non couverte par fuzzy (fuzzy sur 4 mots cue uniquement) |
| 11 | **Classifieur** | `classified = await classifyLastUser(lastUserContent)` | **Toujours appelé** si on arrive ici (pas de gate par `shouldAskClassifierForSomatic`) → coût/latence à chaque tour "DEFAULT" long |
| 12 | Branches classifieur | SELF_HARM → ignoré (fall through). PANIC sans marqueur → fall through. ALLIANCE_REPAIR / STAGNATION / PANIC (avec marqueur) / SOMATIC_ACTIVE (cue + zone) → réponses locales, return | PANIC accepté seulement si `allowClassifierPanic(norm)` (marqueurs panic). SOMATIC : si `mapClassifierZoneToZone(zone)` → null, fall through (zone inconnue) |
| 13 | **DefaultQuick** | `isDefaultQuick(lastUserContent)` → `pickDefaultQuickReply(lastUserContent, avoid)` (avoid recalculé), return | Seuil 12 car + ≤2 mots non stopwords : court-circuite OpenAI pour "ok", "?", "jsp", etc. |
| 14 | **OpenAI** | `reply = await callChat(SYSTEM_PROMPT, messages)` | Erreur réseau / quota → catch → 500, reply générique |
| 15 | Dérive | `hasDrift(reply)` → `reply = await callChatWithReinforcement(...)` | **2e appel OpenAI** → coût + latence ; pas de cap sur échec 2e appel |
| 16 | Troncature | `reply = truncateResponse(reply)` | — |
| 17 | Vide | `!reply || !reply.trim()` → `makeSafeAskReply()`, return | — |
| 18 | **Guardrails style** | `isForbiddenStyle(reply)` → `makeSafeAskReply()`, return (pas de 2e appel) | Conforme LOT 8 |
| 19 | Anti-répétition qtype | `lastQType === qtype` (inféré) → `pickDefaultQuickReply("ok", Set([lastQType]))`, return | Inférence `inferQTypeFromReply` peut manquer des cas → répétition possible |
| 20 | Succès | return `{ reply, mode, meta: qtype }` | — |

**Résumé déraillements principaux**  
- Erreur ou timeout du classifieur ou de `callChat` / `callChatWithReinforcement` → 500.  
- Ordre state : alliance > stagnation > somatic ; rumination empêche stagnation.  
- Somatic local exige zone + cue ; sinon passage classifieur (ou DefaultQuick si entrée courte).  
- Classifieur toujours appelé dès qu’on a dépassé les branches locales (y compris quand un gate type `shouldAskClassifierForSomatic` pourrait éviter l’appel).

---

## 2) Risques techniques — Top 10 (sévérité)

| # | Risque | Type | Sévérité |
|---|--------|------|----------|
| 1 | **Classifieur appelé à chaque tour dès qu’on passe les branches locales** — même pour messages longs sans indice somatic. `shouldAskClassifierForSomatic` (somatic.ts) n’est pas utilisé dans route.ts → coût et latence systématiques. | Coût / perf | M |
| 2 | **Double appel OpenAI en cas de dérive** (`hasDrift` → `callChatWithReinforcement`) sans limite ni fallback si le 2e appel échoue → latence doublée, coût doublé, et en cas d’erreur on retombe dans le catch 500. | Coût / perf / robustesse | M |
| 3 | **`limitSentences` (guardrails)** : logique de fusion des segments avec `ABBREV_SUFFIX` (dernier segment terminé par etc./M./Dr.) peut produire > 2 segments “logiques” si l’abréviation est en milieu de phrase ou si le regex ne matche pas comme prévu. | Bug possible | S |
| 4 | **Réutilisation de `avoid`** : `avoidSetFromLast(messages)` calculé une fois en haut, puis recalculé avant `pickDefaultQuickReply` dans la branche DefaultQuick (l.230) → redondance mineure, pas de bug mais incohérence. | Dette | Faible |
| 5 | **SELF_HARM uniquement local** : si un pattern self-harm est ajouté au classifieur mais oublié en local, il sera ignoré (LOT 10). Inversement, ajout d’un pattern local trop large → faux positifs crise (112). | Conformité / sécurité | M |
| 6 | **`response.choices[0]?.message?.content`** : si l’API renvoie une structure différente (ex. `content: null` ou array), `trim()` sur undefined → pas de throw mais reply vide → fallback safe. Comportement correct mais fragile si l’API change. | Robustesse | S |
| 7 | **`inferQTypeFromReply`** : heuristique sur chaîne ; nouvelles formulations OpenAI peuvent ne pas matcher → `GENERIC_ASK` → pas d’évitement de répétition pour ce qtype. | Dette / UX | S |
| 8 | **Pas de timeout explicite** sur `openai.chat.completions.create` (route + classifieur) → requêtes peuvent rester pendantes longtemps en cas de lenteur API. | Perf / robustesse | M |
| 9 | **Classifier JSON** : `JSON.parse(raw)` en cas de contenu mal formé (texte avant/après le JSON) → throw → catch classifier → fallback DEFAULT. Pas de sanitization de la chaîne (ex. extraire premier `{...}`). | Robustesse | S |
| 10 | **Duplication `stableHash`** dans alliance, stagnation, somatic, defaultQuick → même algorithme dans 4 fichiers. Évolution (ex. seed) incohérente possible. | Dette | Faible |

---

## 3) Suggestions d’amélioration — petites et sûres (max 8)

| # | Suggestion | Bénéfice | Risque | Coût | Fichiers |
|---|------------|----------|--------|------|----------|
| 1 | **Utiliser `shouldAskClassifierForSomatic`** : n’appeler le classifieur que si `!intent.ok` et `shouldAskClassifierForSomatic(norm, intent.ok)` (ou équivalent : cue présent mais zone manquante / longueur suffisante). Sinon passer directement à DefaultQuick ou OpenAI. | Réduit appels classifieur pour messages clairement non somatic ou déjà résolus par intent. | Rater un cas limite somatic (zone typo) déjà rattrapé par le classifieur. | S | `route.ts`, `somatic.ts` (déjà exporté) |
| 2 | **Timeout sur appels OpenAI** : ajouter `timeout` (ex. 15–20 s) dans les options de `create()` (route + classifier) si le SDK le permet. | Évite blocages longs en prod. | Timeout trop court peut couper des réponses valides. | S | `route.ts`, `classifier.ts` |
| 3 | **Extraire le premier objet JSON** dans la réponse du classifieur avant `JSON.parse` (ex. match `\{[\s\S]*\}`), avec fallback sur la chaîne entière. | Réduit les échecs quand le modèle renvoie du texte autour du JSON. | Regex fragile sur JSON imbriqués (peu probable ici). | S | `classifier.ts` |
| 4 | **Ne pas recalculer `avoid`** dans la branche DefaultQuick : réutiliser la variable `avoid` déjà calculée en haut de POST. | Code plus cohérent, moins de confusion. | Aucun. | S | `route.ts` |
| 5 | **Ajouter un test E2E (ou route mockée)** : reply vide après truncate → fallback safe ; reply avec `isForbiddenStyle` → fallback safe sans 2e appel. | Régression guardrails et fallback. | Aucun. | S | `route.test.ts` |
| 6 | **Documenter l’ordre de priorité state** (ALLIANCE > STAGNATION > SOMATIC_ACTIVE) en commentaire en tête de `detectState` ou dans state.ts. | Évite de casser l’ordre en refacto. | Aucun. | S | `state.ts` |
| 7 | **Vérifier que `makePanicReply(lastUserContent)`** : le paramètre est passé depuis la branche classifieur mais non utilisé. Soit le retirer dans l’appel, soit documenter (ex. pour évolution future). | Clarté de l’API. | Aucun. | S | `route.ts`, `panic.ts` |
| 8 | **Un seul module `hash`** exportant `stableHash(str: string): number` et l’utiliser dans alliance, stagnation, somatic, defaultQuick. | Une seule implémentation à maintenir. | Changement de comportement si implé diffère (tester que les hash sont identiques). | M | Nouveau `server/hash.ts`, `alliance.ts`, `stagnation.ts`, `somatic.ts`, `defaultQuick.ts` |

---

## 4) Tests manquants les plus importants (max 10) — orientés régressions

1. **Route : classifieur lance une exception** → réponse 500 avec `reply` et `mode: "ASK"` (pas de leak stack).
2. **Route : premier `callChat` lance une exception** → 500, pas de 2e appel.
3. **Route : premier appel OK, `hasDrift(reply)` true, `callChatWithReinforcement` lance une exception** → comportement attendu (500 ou fallback safe) documenté et asserté.
4. **Guardrails : `limitSentences`** avec exactement 2 phrases dont la première se termine par "etc." → résultat reste ≤ 2 phrases et préserve "etc.".
5. **Guardrails : `truncateResponse`** avec une chaîne > 300 car dont la dernière frontière de phrase est après 300 → pas de phrase coupée au milieu d’un mot.
6. **State : message avec marqueur alliance ET stagnation** (ex. "tu m'écoutes pas et ça change rien") → state ALLIANCE_REPAIR (priorité).
7. **State : message avec stagnation + rumination** ("ça ne change rien et je rumine") → state DEFAULT (pas STAGNATION).
8. **Somatic : zone reconnue sans cue** (ex. "dans la nuque") → `detectSomaticIntent` ok = false → pas de branche locale somatic dans la route (test d’intégration ou unitaire somatic + route).
9. **Crisis : texte avec mot évocateur mais pas pattern explicite** (ex. "j'ai des idées noires") → pas de détection self-harm local → pas de 112 (déjà partiellement couvert par LOT 10 ; renforcer avec un test dédié local `detectSelfHarm`).
10. **DefaultQuick : entrée à la frontière** (ex. 12 car normalisés, 2 mots non stopwords) → `isDefaultQuick` true ; 13 car ou 3 mots → false.

---

## 5) Ce que tu NE ferais PAS (anti-refacto)

1. **Refonte globale du flux** (ex. machine à états unique, réécriture de toute la logique de priorité) — garder l’ordre actuel des if/else et les branches locales en premier.
2. **Remplacer les branches locales par “tout passer par le classifieur”** — le classifieur doit rester un rattrapage ; SELF_HARM et PANIC restent décidés localement en priorité.
3. **Introduire DB, analytics détaillées ou auth** dans le périmètre de cet audit — hors scope.
4. **Élargir les contraintes produit** (ex. autoriser “pourquoi”, conseils, ou réponses > 300 car) pour “simplifier” le code — les garde-fous et la troncature sont essentiels.
5. **Factoriser les réponses locales (crisis, panic, alliance, stagnation, somatic, defaultQuick)** en un “moteur de réponses” générique avec config — risque de casser les spécificités (ex. 112/3114 uniquement crise, pas panic) et de compliquer les tests par LOT.

---

*Fin de l’audit. Aucune refonte complète proposée ; esprit “local robuste + OpenAI contrôlé” conservé.*

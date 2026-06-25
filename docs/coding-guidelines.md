# SmartCrops Coding Guidelines

This document captures the conventions used in SmartCrops. It is **the canonical source of project conventions** and is linked from CodeRabbit's Knowledge Base → Code guidelines feature so that reviews are calibrated to these expectations.

Conventions may evolve; significant changes should be made via PR and discussed.

## 1. Git workflow

- **git-flow**: `main` is production-ready, `develop` is integration, feature branches are named `feat/<topic>-<descriptor>` (e.g. `feat/adr-0002-bcp47-subset`).
- **PR base branch**: always `develop`. `main` is updated only via release merges.
- **Conventional commits** for the squash-merge subject line:
  - `feat(scope):` — new feature
  - `fix(scope):` — bug fix
  - `refactor(scope):` — code change without behavior change
  - `test(scope):` — test addition or modification
  - `docs(scope):` — documentation only
  - `style(scope):` — formatting only
  - `chore(scope):` — tooling, dependencies, build
- **Squash merge** is the rule. Feature branches accumulate WIP commits; they collapse to one commit on `develop` with a clean conventional message.
- **Delete the branch** after merge (`gh pr merge --squash --delete-branch`).
- **Sync `develop` locally** after every merge.

## 2. PR conventions

- **PR title**: same as the squash subject — conventional commit format.
- **PR body**: structured with Summary / Design / Scope / Testing / Validation sections at minimum. The Validation section is a checklist confirming `dotnet build` / `dotnet test` / `dotnet format --verify-no-changes` / `npm run lint` / `npm test` all pass.
- **One concern per PR**. If a PR grows in scope mid-flight, split it. Doc-only PRs are valid (e.g. PR #45 introduced ADR-0002 with no code change).
- **CodeRabbit harvest** is mandatory after each push. The `coderabbit-harvest` skill formalizes this — see `.claude/skills/coderabbit-harvest/`.
- **CodeRabbit comments** are classified ACCEPT / DEFER / REJECT / NO-OP. ACCEPT items are addressed in the same PR. DEFER items become GitHub issues with `tech-debt` or `enhancement` labels. REJECT items are rationalized in the PR thread or commit body.
- **No merge without** all CI green and CodeRabbit re-review completed.

## 3. Backend C# conventions

- **Target framework**: .NET 8.
- **Async by default**: any I/O-bound operation uses `async`/`await` with `CancellationToken` parameters propagated.
- **Sealed classes**: prefer `sealed` unless inheritance is explicitly intended. Most domain types and infrastructure helpers are sealed.
- **Nullable reference types**: enabled at solution level. Methods that may return null annotate with `?`. Nullable disable is not used.
- **EF Core patterns**:
  - DbContext per request scope (default in ASP.NET Core DI).
  - Migrations are immutable history. Schema changes go through new migrations, not amendments to past ones.
  - Snapshot consistency: `dotnet ef migrations add` must produce a snapshot that matches what's in source control.
  - Value converters for normalization (e.g. `ToLowerInvariant` on `PlantCommonName.LanguageCode`).
  - Check constraints (`HasCheckConstraint`) for invariants enforced at the database layer.
- **`ApplicationUser`** extends `IdentityUser`. Don't reach into Identity internals; use `UserManager<ApplicationUser>` and `SignInManager<ApplicationUser>`.
- **Auth**: HttpOnly cookies (`smartcrops_token`), JWT with security stamp validation, Google OAuth.

## 4. Frontend TypeScript / React conventions

- **Target**: React 18 + Vite + TypeScript strict mode + MUI v7.
- **No `any` type**. Use `unknown` and narrow, or define a proper type. TypeScript's strict mode (incl. `noImplicitAny`) prevents *implicit* `any` (when type inference fails); explicit `any` annotations remain permitted unless an ESLint rule like `@typescript-eslint/no-explicit-any` is enabled. The team standard is to avoid explicit `any` even where the compiler allows it.
- **Component naming**: PascalCase for component files (`PlantCard.tsx`), camelCase for hook and utility files (`usePlantData.ts`). Functions use camelCase; types and interfaces use PascalCase.
- **MUI v7 only**. Don't introduce other UI libraries. If a component is missing, build it from MUI primitives.
- **Error boundaries** at the page level for graceful degradation.
- **State management**: React's built-in hooks (`useState`, `useReducer`, `useContext`). No external state library unless cross-page state becomes complex.
- **API calls**: typed at the boundary. The shape of the response is declared with an explicit interface; runtime validation uses Zod for untrusted inputs.

### Styling & theming

- **No literal colors in components.** Use MUI theme tokens or shared named constants — never inline `#hex`/`rgba()` literals. Intentional exceptions stay as named constants, never anonymous inline values: brand constants (e.g. `NAV_BG`) and semantic visualization palettes (e.g. the Garden Planner grid).
- **Mode-aware colors.** Components derive colors from `palette.mode`; never hardcode a color that breaks the dark theme.

### Overlays

- **Disable the scroll lock on overlays.** The scrollbar gutter is stabilized globally in `theme.ts` (`html { overflow-y: scroll; scrollbar-gutter: stable }`); each overlay must also opt out of MUI's scroll lock so the page doesn't shift on open. The prop's location depends on the component: `disableScrollLock` directly on `Dialog`/`Menu`/`Popover`; via `MenuProps={{ disableScrollLock: true }}` on `Select`; via `ModalProps={{ disableScrollLock: true }}` on a temporary `Drawer`.

### State & rendering

- **Single source of truth for derived content.** A section's visibility gate and its render must derive from the same parse. Don't duplicate split/trim/filter between the gate and the component — extract one function (e.g. `getCultureFacts`) that both consume, so "what content exists" lives in exactly one place.

### Internationalization

- **Plural/singular by value.** Any displayed unit or count selects its key from the value (pattern: `days` / `days_one`). Never hardcode a plural form.
- **User-facing strings live in the i18n files**, not as literals in components (rare, deliberately-documented design exceptions aside).

### Constants

- **Extract shared magic numbers.** Shared literals (e.g. the navbar scroll offset `80px`) live in one named constant reused everywhere, not duplicated across call sites.

### Accessibility

- **Label→value pairs as a description list.** Render term/value rows with `component="dl"` + `dt`/`dd` (visual `sx` unchanged) so assistive tech gets the programmatic association — not generic flex `Box`es.
- **`aria-label`s come from i18n**, not hardcoded strings — pass a translated value (the literal in `t('common.close', 'Close')` is the neutral default behind the key, not a hardcoded label).

## 5. Testing

- **Backend**: xUnit. Test classes named `<Subject>Tests`. Methods named `<MethodUnderTest>_<Condition>_<Outcome>` (e.g. `Bcp47LanguageCodeLowercase_Matches_ValidLowercaseTags`).
- **`[Theory]` + `[InlineData]`** for parameterized tests. Each `[InlineData]` is a single test case.
- **No integration tests against PostgreSQL** without Testcontainers. EF Core's in-memory provider does not enforce check constraints. (Issue #39 tracks Testcontainers introduction.)
- **Frontend**: Vitest + Testing Library. Component tests assert observable behavior, not implementation details.
- **No mocks of own code** unless the mock is justified by a clear architectural boundary (e.g. mocking a third-party HTTP client at the boundary).
- **Validation suite** before every commit: `dotnet build` / `dotnet test` / `dotnet format --verify-no-changes` / `npm run lint` / `npm test`. All must pass.

## 6. Documentation

- **XML doc expectation**: document public C# methods, properties, and classes with non-trivial behavior — this is the team standard. The CI Docstring Coverage check enforces an 80% floor (warnings tolerated, but missing docs are still a violation of the standard, to be improved incrementally).
- **`/// <summary>`** for the top-level description, `<param>` for each parameter, `<returns>` for non-void return, `<exception>` for thrown exceptions when relevant.
- **JSDoc on exported `utils/*.ts` members.** The 80% docstring floor applies to the frontend too: exported helpers/mappers in `utils/*.ts` carry a JSDoc. (Target, not a merge gate.)
- **README.md** at the repo root summarizes the project. Subdirectory docs follow the local convention: Claude Code skills use `.claude/skills/<name>/SKILL.md` as the canonical entry point (with `README.md` as optional human-readable supplement); other subdirectories may use `README.md` or directory-local conventions as appropriate.
- **ADRs** in `docs/adr/` for architectural decisions. Follow the format established by ADR-0001 (`docs/adr/0001-...md`): Status / Date / Deciders / Context / Decision / Rationale / Consequences / When to revisit / Related.
- **Markdown fenced code blocks** must declare a language tag (markdownlint MD040). Use `regex`, `text`, `csharp`, `powershell`, etc. — pick the closest fit.

## 7. Architecture decisions

The canonical source of architectural decisions is `docs/adr/`. As of this writing, two ADRs exist:

- **ADR-0001** — Use `DateTime` (UTC) rather than `DateTimeOffset` for all timestamp fields. Introduced with PR #37 (SaveChangesInterceptor for `IHasUpdatedAt`).
- **ADR-0002** — Simplified BCP 47 subset for `PlantCommonName.LanguageCode` validation. Introduced with PR #45.

When making an architectural decision that affects multiple components, the system, or future flexibility, write a new ADR. Use the template in ADR-0001.

If an ADR ever needs to change, the change is recorded as **a new ADR that supersedes the previous one** (status: Superseded by ADR-NNNN). ADRs are immutable history, like database migrations.

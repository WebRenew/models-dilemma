# Contributing to The Model's Dilemma

Thanks for your interest in contributing! This project explores LLM strategic reasoning through game theory experiments.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/models-dilemma.git`
3. Install dependencies: `pnpm install`
4. Copy `.env.example` to `.env.local` and add your credentials
5. Run the dev server: `pnpm dev`

## Development Workflow

1. Create a branch for your feature: `git checkout -b feature/your-feature`
2. Make your changes
3. Run linting: `pnpm lint`
4. Test your changes locally
5. Commit with a descriptive message
6. Push and open a pull request

## Areas for Contribution

### New Experiments
See `ROADMAP.md` for planned experiments. To add a new experiment:

1. Add prompt templates in `lib/prompts.ts` following the overt/cloaked pattern
2. Create response parsing logic for the new decision format
3. Add any new database columns needed in Supabase
4. Update the UI to display results

### New Models
To add a new LLM to the tournament:

1. Add the model definition in `lib/models.ts`
2. Ensure it's supported by `@ai-sdk/gateway` or add a custom provider
3. Update `src/trigger/run-tournament.ts` to include it in the model list

### UI Improvements
- Components live in `components/`
- We use shadcn/ui components in `components/ui/`
- Styling is Tailwind CSS 4

### Analytics & Visualization
- Stats queries are in `lib/supabase/db.ts`
- Charts use Recharts
- New metrics can be added to the model explorer page

## Code Style

- TypeScript throughout
- Use existing patterns in the codebase
- Keep functions focused and well-named
- Add types for new data structures

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include a clear description of what and why
- Reference any related issues
- Ensure lint passes

## Reporting Issues

Open an issue on GitHub with:
- Clear description of the problem or suggestion
- Steps to reproduce (for bugs)
- Expected vs. actual behavior
- Screenshots if relevant

## Questions

Open a GitHub issue for questions about the codebase or experiment design.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

# Oren Research - Multi-Agent Deep Research System

A  multi-agent research orchestration system that spawns and coordinates  AI agents to conduct comprehensive research on any topic. 

## Features

- **Central Orchestrator Architecture**: A master orchestrator coordinates specialized sub-agents
- **Multi-Model Support**: Configure different models for orchestration, planning, research, and report writing
- **Real-Time Streaming**: Live SSE updates showing agent progress and tool execution
- **Query Disambiguation Flow**: Clarification UX Flow inspired by Claude Code's Plan Model.
- **File-Based Context Management**: Each agent maintains isolated context via the file system
- **Observability**:  Live visualisation showing orchestrator, agents, and tool execution steps
- **PDF Export**: Download PDFs of the generated report

## Demo

[![Oren Research Demo](https://img.youtube.com/vi/88Nh4NfIlfY/maxresdefault.jpg)](https://www.youtube.com/watch?v=88Nh4NfIlfY)

Click to watch the demo video.

## Architecture

The system is built around a **central orchestrator** that dynamically spawns specialized **sub-agents** to handle different aspects of research:

**Orchestrator** → Spawns multiple **Sub-Agents** → Each agent uses **Tools**

### Sub-Agent Tools

Each sub-agent has access to:
- **Web Search** (Exa AI) - Semantic search with keyword/neural modes
- **Code Interpreter** (E2B Sandbox) - Execute Python for data analysis and chart generation
- **File Operations** - Read/write within isolated workspace
- **Content Summarization** - Compress lengthy content for context management

The **E2B sandbox** enables agents to generate visualizations, run calculations, and produce charts that get embedded in the final report.

## Orchestration Workflow

The system follows a 4-phase linear workflow:

```
1. PLANNING       → generate_plan tool creates strategic research plan
       ↓
2. DELEGATION     → spawn_agent tool creates 2-10 specialized agents
       ↓
3. COLLECTION     → wait_for_agents + get_agent_result gather findings
       ↓
4. REPORT         → write_report synthesizes findings into final report
```

## Available Tools

### Orchestrator Tools

| Tool | Purpose |
|------|---------|
| `generate_plan` | Strategic research planning with perspective analysis |
| `spawn_agent` | Create specialized research agents with specific tasks |
| `wait_for_agents` | Synchronization barrier for parallel agent execution |
| `get_agent_result` | Retrieve completed agent findings and artifacts |
| `update_plan` | Dynamically modify research plan based on findings |
| `write_report` | Synthesize all findings into final markdown report |
| `file` | Read/write files within session workspace |

### Sub-Agent Tools

| Tool | Purpose |
|------|---------|
| `web_search` | Semantic web search via Exa AI (keyword/neural modes) |
| `code_interpreter` | Execute Python code in E2B sandbox environment |
| `file` | File operations within agent workspace |
| `view_image` | Process and analyze images |

## Context Management

Each research session uses **file-based context isolation**:

```
reports/
└── <session-id>/
    ├── orchestrator_plan.json    # Strategic research plan
    ├── orchestrator_worklog.md   # Orchestrator activity log
    ├── final_report.md           # Final synthesized report
    ├── artifacts/                # Shared artifacts between agents
    └── agents/
        └── <agent-id>/
            ├── results.md        # Agent findings
            └── charts/           # Generated visualizations
```

This approach ensures:
- **Agent isolation**: Each agent has its own workspace
- **Artifact sharing**: Orchestrator can collect outputs from all agents
- **Session persistence**: Reports survive server restarts
- **Clean separation**: No cross-session contamination

## Multi-Model Support

Configure different models for different tasks:

| Role | Default Model | Purpose |
|------|---------------|---------|
| Orchestrator | `anthropic/claude-haiku-4.5` | Coordination and workflow |
| Planning | `anthropic/claude-opus-4.5` | Strategic research analysis |
| Sub-Agent | `anthropic/claude-haiku-4.5` | Research execution |
| Report Writing | `anthropic/claude-haiku-4.5` | Final synthesis |
| Summarizer | `google/gemini-2.5-flash` | Content summarization |

Models can be configured via:
1. Environment variables (`MODEL`)
2. Frontend model selector UI
3. Per-request API parameters

## Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- API Keys:
  - [OpenRouter](https://openrouter.ai/keys) - LLM access
  - [Exa](https://exa.ai/) - Web search
  - [E2B](https://e2b.dev/) - Code execution sandbox

### Installation

```bash
# Clone repository
git clone <repository-url>
cd oren-research

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Set up environment
cp .env.example .env
# Edit .env with your API keys
```

### Running the Application

**Development mode (two terminals):**

```bash
# Terminal 1 - Backend
npm run dev:backend

# Terminal 2 - Frontend
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000)

**Production mode:**

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Start backend
npm start

# Start frontend (separate process)
cd frontend && npm run start
```


## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM access |
| `EXASEARCH_API_KEY` | Exa API key for web search |
| `E2B_API_KEY` | E2B API key for code execution |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `MODEL` | `anthropic/claude-haiku-4.5` | Default LLM model |
| `PORT` | `3001` | Backend server port |
| `NODE_ENV` | `development` | Environment mode |
| `DEBUG` | `false` | Enable debug logging |
| `LOG_OUTPUT` | `console` | Log destination: `console`, `file`, or `both` |
| `REQUIRE_USER_KEYS` | `false` | Require API keys from headers (for production) |

## Logging

The system supports flexible logging configuration:

```bash
# Console only (default)
LOG_OUTPUT=console

# File only (logs to ./logging/)
LOG_OUTPUT=file

# Both console and file
LOG_OUTPUT=both

# Enable debug logs
DEBUG=true
```

Log files are organized as:
- `logging/app.log` - Global application logs
- `logging/<session-id>.log` - Session-specific logs

## Deployment

### Production Configuration

For production deployments where users provide their own API keys:

1. Set `REQUIRE_USER_KEYS=true` in environment
2. Do NOT set the API key environment variables
3. Users must provide keys via the frontend UI (stored in localStorage)
4. Keys are passed via HTTP headers, never stored on server


## Project Structure

```
oren-research/
├── backend/
│   ├── server.ts                 # Express server, API routes, PDF generation
│   ├── logger.ts                 # Configurable logging system
│   ├── orchestrator/
│   │   ├── streamingOrchestrator.ts  # Main orchestration logic
│   │   ├── streamingSubAgent.ts      # Sub-agent implementation
│   │   └── stateManager.ts           # Session state & SSE events
│   ├── prompts/
│   │   ├── orchestrator.ts       # Orchestrator system prompt
│   │   ├── subagent.ts           # Sub-agent system prompt
│   │   └── disambiguate.ts       # Query clarification prompt
│   ├── tools/
│   │   ├── orchestrator/         # Orchestrator tools (7 tools)
│   │   └── subagent/             # Sub-agent tools (5 tools)
│   └── utils/
│       └── exa-rate-limiter.ts   # Exa API rate limiting
├── frontend/
│   ├── app/                      # Next.js App Router
│   ├── components/               # React components
│   ├── hooks/                    # Custom hooks (useReportStream)
│   └── lib/                      # Utilities (dagreLayout)
├── shared/
│   └── types/                    # Shared TypeScript types
├── reports/                      # Generated reports (git-ignored)
└── logging/                      # Log files (git-ignored)
```

## Troubleshooting

### Backend won't start
- Verify all required API keys are set in `.env`
- Check port 3001 is available
- Ensure Node.js 18+ is installed

### Frontend can't connect to backend
- Verify backend is running on port 3001
- Check `NEXT_PUBLIC_API_BASE` if using custom port
- Look for CORS errors in browser console

### Agents fail or timeout
- Check API key validity and credits
- Review logs in `./reports/<session-id>/`
- Default agent timeout is 180 seconds

### Rate limiting errors
- Exa API has rate limits - the system includes automatic rate limiting
- Consider upgrading API tier for higher limits

## Roadmap

- [ ] Improving chart visualization quality
- [ ] Critique flow in agents (self-review before finalizing)
- [ ] Improving disambiguation flow
- [ ] In-line report editing after generation

## License

MIT

## Acknowledgments

- [Vercel AI SDK](https://sdk.vercel.ai/) - Streaming AI capabilities
- [OpenRouter](https://openrouter.ai/) - Multi-model LLM access
- [Exa](https://exa.ai/) - Semantic web search
- [E2B](https://e2b.dev/) - Code execution sandbox

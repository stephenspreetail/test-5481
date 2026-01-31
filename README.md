# Agent Lightning Showcase

A comprehensive demonstration of [Microsoft's Agent Lightning](https://github.com/microsoft/agent-lightning) framework for training AI agents using reinforcement learning and automatic prompt optimization.

## What is Agent Lightning?

Agent Lightning is an open-source Python framework that enables you to train and optimize AI agents with minimal code changes. It supports:

- **Framework-agnostic design** - Works with LangChain, OpenAI SDK, AutoGen, CrewAI, or standalone Python
- **Multiple training algorithms** - APO (Automatic Prompt Optimization), VERL (Reinforcement Learning), and more
- **Selective optimization** - Train one or more agents in multi-agent systems
- **Zero-friction integration** - Minimal changes to existing agent code

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/agent-lightning-showcase.git
cd agent-lightning-showcase

# Install dependencies
pip install -r requirements.txt

# Or install as a package
pip install -e .
```

### Set up your API key

```bash
export OPENAI_API_KEY="your-api-key-here"
```

### Run your first example

```bash
python examples/01_basic_sentiment_training.py
```

## Project Structure

```
agent-lightning-showcase/
├── agent_lightning_showcase/
│   ├── __init__.py
│   ├── agents/                  # Agent implementations
│   │   ├── sentiment_agent.py   # Sentiment classification agent
│   │   ├── qa_agent.py          # Question answering agent
│   │   ├── math_agent.py        # Math problem solver
│   │   └── multi_agent.py       # Multi-agent pipeline
│   ├── datasets/                # Sample datasets
│   │   └── sample_datasets.py   # Training and validation data
│   └── utils/                   # Utilities
│       ├── graders.py           # Reward grading functions
│       └── prompt_templates.py  # Baseline prompts
├── examples/                    # Runnable examples
│   ├── 01_basic_sentiment_training.py
│   ├── 02_qa_agent_training.py
│   ├── 03_math_solver_training.py
│   ├── 04_multi_agent_pipeline.py
│   └── 05_custom_store_and_strategy.py
├── requirements.txt
├── setup.py
└── README.md
```

## Examples

### 1. Basic Sentiment Training

The simplest example showing how to train a sentiment classification agent:

```python
import agentlightning as agl
from openai import AsyncOpenAI

@agl.rollout
def sentiment_agent(task: dict, prompt_template: agl.PromptTemplate) -> float:
    formatted_prompt = prompt_template.format(text=task["text"])
    response = prompt_template.complete(formatted_prompt)

    reward = 1.0 if response.lower() == task["expected"].lower() else 0.0
    agl.emit_reward(reward)
    return reward

# Configure and run training
trainer = agl.Trainer(
    algorithm=agl.APO(AsyncOpenAI()),
    n_runners=4,
    initial_resources={"prompt_template": my_prompt_template},
)

trainer.fit(agent=sentiment_agent, train_dataset=train_data, val_dataset=val_data)
```

### 2. Class-Based Agents

For more complex agents, use the `LitAgent` class:

```python
class QAAgent(agl.LitAgent):
    def rollout(self, task, resources, rollout) -> float:
        prompt_template = resources["prompt_template"]

        with agl.operation("answer_generation"):
            response = prompt_template.complete(
                prompt_template.format(
                    context=task["context"],
                    question=task["question"]
                )
            )

        reward = grade_answer(response, task["expected"])
        agl.emit_reward(reward)
        return reward
```

### 3. Multi-Agent Pipelines

Train multiple agents working together:

```python
class MultiAgentPipeline(agl.LitAgent):
    def rollout(self, task, resources, rollout) -> float:
        # Agent 1: Analyze
        with agl.operation("analyze"):
            analysis = resources["analyzer"].complete(...)
            agl.emit_reward(analysis_reward, primary_key="analysis")

        # Agent 2: Respond
        with agl.operation("respond"):
            response = resources["responder"].complete(...)
            agl.emit_reward(response_reward, primary_key="response")

        return (analysis_reward + response_reward) / 2
```

### 4. Custom Store and Strategy

Configure advanced options like persistent stores and distributed training:

```python
# Use MongoDB for persistent storage
store = agl.MongoLightningStore(
    mongo_uri="mongodb://localhost:27017/?replicaSet=rs0"
)

# Use client-server strategy for distributed training
trainer = agl.Trainer(
    algorithm=agl.APO(client),
    store=store,
    strategy="client_server",
    port=4747,
    n_runners=8,
)
```

## Key Concepts

### Rollout Decorator

The `@agl.rollout` decorator transforms a function into a trainable agent:

```python
@agl.rollout
def my_agent(task, prompt_template: agl.PromptTemplate) -> float:
    # Agent logic here
    return reward
```

### Emit Functions

Track agent behavior and rewards:

```python
agl.emit_message("Processing input...")      # Log messages
agl.emit_object({"key": "value"})            # Log structured data
agl.emit_reward(0.85)                        # Log rewards
agl.emit_reward(0.9, primary_key="accuracy") # Named rewards
```

### Operations

Track execution spans for analysis:

```python
with agl.operation("step_name"):
    # This code is tracked as a named operation
    result = do_something()
```

### APO Algorithm

Automatic Prompt Optimization uses LLM-generated textual gradients:

```python
algorithm = agl.APO(
    openai_client,
    gradient_model="gpt-4o-mini",     # Model for critiques
    apply_edit_model="gpt-4o-mini",   # Model for edits
    beam_width=4,                      # Prompts to keep per round
    branch_factor=4,                   # New candidates per parent
    beam_rounds=3,                     # Optimization iterations
)
```

### Trainer

The central orchestrator:

```python
trainer = agl.Trainer(
    algorithm=algorithm,              # Training algorithm
    n_runners=8,                       # Parallel runners
    store=store,                       # Optional custom store
    strategy="shared_memory",          # Execution strategy
    initial_resources={...},           # Starting resources
    hooks=[MyHook()],                  # Lifecycle callbacks
)
```

## API Reference

### Agent Decorators

| Decorator | Description |
|-----------|-------------|
| `@rollout` | Auto-detect agent type from signature |
| `@llm_rollout` | LLM-based agent rollout |
| `@prompt_rollout` | Prompt template-based rollout |

### Emit Functions

| Function | Description |
|----------|-------------|
| `emit_reward(reward)` | Record numeric reward |
| `emit_message(text)` | Record log message |
| `emit_object(obj)` | Record structured data |
| `emit_exception(exc)` | Record exception |

### Store Types

| Store | Use Case |
|-------|----------|
| `InMemoryLightningStore` | Development/testing |
| `MongoLightningStore` | Production with persistence |

### Execution Strategies

| Strategy | Use Case |
|----------|----------|
| `shared_memory` | Single process, cooperative threads |
| `client_server` | Distributed, multi-process |

## License

MIT License - See [LICENSE](LICENSE) for details.

## Resources

- [Agent Lightning GitHub](https://github.com/microsoft/agent-lightning)
- [Documentation](https://microsoft.github.io/agent-lightning/)
- [Research Paper](https://arxiv.org/abs/2508.03680)

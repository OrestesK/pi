from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def test_contract_is_absolute_and_valsmith_scoped() -> None:
    contract = yaml.safe_load((ROOT / "contract.yaml").read_text())

    assert contract["name"] == "ok-pi-agent"
    assert contract["install_cmd"] == "bash /bundle/ok-pi-agent/setup.sh"
    assert contract["final_output"] == "/logs/ok-pi-agent"
    assert contract["egress_allowlist"] == [
        "https://chatgpt.com",
        "https://auth.openai.com",
        "https://mcp.context7.com",
    ]
    assert contract["secrets"] == {"PI_CODEX_AUTH_JSON_B64": "ok-pi-agent-codex-auth-json-b64"}

    run_cmd = contract["run_cmd"]
    assert run_cmd.startswith("/usr/local/bin/python3 /bundle/ok-pi-agent/run_agent.py ")
    assert "--problem-statement '{problem_statement_path}'" in run_cmd
    assert "--task-id '{task_id}'" in run_cmd

    timeout = contract["defaults"]["timeout_seconds"]
    assert timeout == {
        "type": "int",
        "required": False,
        "default": 7200,
        "description": "Internal unattended deadline in seconds",
    }

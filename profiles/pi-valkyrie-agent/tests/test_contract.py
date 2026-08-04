from pathlib import Path
from typing import Any, cast

import yaml


ROOT = Path(__file__).resolve().parents[1]


def load_contract(name: str) -> dict[str, Any]:
    value = cast(object, yaml.safe_load((ROOT / name).read_text()))
    assert isinstance(value, dict)
    return cast(dict[str, Any], value)


def assert_common_contract(contract: dict[str, Any], bundle_name: str) -> None:
    assert contract["install_cmd"] == f"bash /bundle/{bundle_name}/setup.sh"
    assert contract["final_output"] == "/logs/ok-pi-agent"
    assert contract["secrets"] == {"OPENAI_API_KEY": "prodBenchmarksInfraApiKeys"}

    run_cmd = contract["run_cmd"]
    assert run_cmd.startswith(f"/usr/local/bin/python3 /bundle/{bundle_name}/run_agent.py ")
    assert "--problem-statement '{problem_statement_path}'" in run_cmd
    assert "--task-id '{task_id}'" in run_cmd
    assert "--declared-model '{model}'" in run_cmd
    assert "--prompt-profile '{prompt_profile}'" in run_cmd

    assert contract["defaults"]["model"] == {
        "type": "str",
        "required": True,
        "choices": ["openai/gpt-5.6-sol"],
        "description": "Required Vals model key matching the pinned Pi runtime",
    }
    assert contract["defaults"]["prompt_profile"] == {
        "type": "str",
        "required": True,
        "choices": ["simple", "adapted"],
        "description": "Required AGENTS prompt profile",
    }


def test_restricted_contract_preserves_network_boundary() -> None:
    contract = load_contract("contract.yaml")

    assert contract["name"] == "ok-pi-agent"
    assert_common_contract(contract, "ok-pi-agent")
    assert "--trusted-mcp-config" not in contract["run_cmd"]
    assert "trusted_mcp_config_path" not in contract["defaults"]
    assert contract["egress_allowlist"] == [
        "https://api.openai.com",
        "https://mcp.context7.com",
    ]
    assert contract["defaults"]["timeout_seconds"] == {
        "type": "int",
        "required": False,
        "default": 7200,
        "description": "Internal unattended deadline in seconds",
    }


def test_vcb_contract_has_separate_runtime_policy() -> None:
    contract = load_contract("contract.vcb.yaml")

    assert contract["name"] == "ok-pi-agent-vcb"
    assert_common_contract(contract, "ok-pi-agent-vcb")
    assert "egress_allowlist" not in contract
    assert "--trusted-mcp-config '{trusted_mcp_config_path}'" in contract["run_cmd"]
    assert contract["defaults"]["trusted_mcp_config_path"] == {
        "type": "str",
        "required": True,
        "description": "Infrastructure-owned MCP config outside the task workspace",
    }
    assert contract["defaults"]["timeout_seconds"] == {
        "type": "int",
        "required": False,
        "default": 18000,
        "description": "Vibe Code Bench unattended deadline in seconds",
    }

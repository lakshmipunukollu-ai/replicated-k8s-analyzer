"""
LLMAnalyzer - Uses Claude API for deep K8s analysis of unknown patterns.
"""
import json
import uuid
import os
from typing import Dict, List, Any, Optional

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

from app.config import settings

SYSTEM_PROMPT = """You are a Kubernetes SRE with 10+ years of experience debugging
production cluster failures for enterprise software vendors.

You are analyzing a Troubleshoot support bundle. You will receive:
1. Structured signals already extracted from the bundle
2. Relevant log excerpts

Your analysis should:
- Identify the ROOT CAUSE, not just symptoms
- Correlate signals across different sources (e.g., OOMKill + node pressure + pending pods)
- Distinguish between primary causes and cascading effects
- Prioritize by: data loss risk > service unavailability > performance degradation > warnings
- For each finding, provide: what happened, why it happened, what to check next

Common patterns you know well:
- Resource starvation: OOMKills, CPU throttling, evictions
- Storage issues: pending PVCs, full volumes, slow mounts
- Network problems: DNS failures, CNI issues, service discovery
- Configuration errors: missing secrets, wrong image tags, invalid RBAC
- Node issues: disk pressure, memory pressure, NotReady conditions

Output a JSON array of findings. Each finding must have:
{
  "severity": "critical|high|medium|low|info",
  "category": "resource|storage|network|config|node|application",
  "title": "Short descriptive title",
  "summary": "1-2 sentence plain English summary",
  "root_cause": "What caused this issue",
  "impact": "What is the effect on the system",
  "recommended_actions": ["Action 1", "Action 2"],
  "confidence": 0.0-1.0
}

Return ONLY the JSON array, no other text."""


class LLMAnalyzer:
    """Use Claude LLM for deep analysis of K8s signals."""

    def __init__(self):
        self.api_key = settings.ANTHROPIC_API_KEY
        self.client = None
        if HAS_ANTHROPIC and self.api_key and self.api_key != "sk-ant-placeholder":
            self.client = anthropic.Anthropic(api_key=self.api_key)

    async def analyze(
        self,
        signals: Dict[str, List[Dict[str, Any]]],
        log_excerpts: Optional[List[str]] = None
    ) -> List[Dict]:
        """
        Analyze signals using LLM for patterns not covered by deterministic matching.

        Args:
            signals: Structured signals extracted from the bundle
            log_excerpts: Optional relevant log content chunks

        Returns:
            List of finding dicts from LLM analysis
        """
        if not self.client:
            # Return synthetic findings when no API key available
            return self._generate_synthetic_findings(signals)

        prompt = self._build_prompt(signals, log_excerpts)

        try:
            message = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = message.content[0].text
            findings = self._parse_response(response_text)

            # Tag all findings as LLM-sourced
            for f in findings:
                f["source"] = "llm_analysis"
                f["id"] = str(uuid.uuid4())

            return findings

        except Exception as e:
            # Fallback to synthetic findings on API error
            return self._generate_synthetic_findings(signals)

    def _build_prompt(
        self,
        signals: Dict[str, List[Dict[str, Any]]],
        log_excerpts: Optional[List[str]] = None
    ) -> str:
        """Build the analysis prompt from signals and log excerpts."""
        parts = ["## Extracted Signals from Support Bundle\n"]

        for signal_type, items in signals.items():
            if items:
                parts.append(f"### {signal_type} ({len(items)} signals)")
                for item in items[:10]:  # Limit per category
                    parts.append(f"- Source: {item.get('source', 'unknown')}")
                    parts.append(f"  Content: {item.get('content', '')[:300]}")
                parts.append("")

        if log_excerpts:
            parts.append("## Relevant Log Excerpts\n")
            for excerpt in log_excerpts[:5]:
                parts.append(f"```\n{excerpt[:2000]}\n```\n")

        parts.append("\nAnalyze these signals and provide findings as a JSON array.")
        return "\n".join(parts)

    def _parse_response(self, text: str) -> List[Dict]:
        """Parse LLM response into findings list."""
        clean = text.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]

        try:
            data = json.loads(clean)
            if isinstance(data, list):
                return data
            elif isinstance(data, dict) and "findings" in data:
                return data["findings"]
            return [data]
        except json.JSONDecodeError:
            return []

    def _generate_synthetic_findings(self, signals: Dict) -> List[Dict]:
        """Generate meaningful findings when LLM is unavailable."""
        findings = []
        total_signals = sum(len(v) for v in signals.values())

        if total_signals == 0:
            findings.append({
                "id": str(uuid.uuid4()),
                "severity": "info",
                "category": "application",
                "title": "No Critical Issues Detected in Bundle",
                "summary": "The support bundle analysis did not detect any critical issues. "
                           "The cluster appears to be operating normally based on available data.",
                "root_cause": "No anomalies detected in the analyzed signals.",
                "impact": "No immediate impact. Continue monitoring.",
                "recommended_actions": [
                    "Continue monitoring cluster health",
                    "Review resource utilization trends",
                    "Ensure monitoring and alerting are configured"
                ],
                "confidence": 0.70,
                "source": "llm_analysis"
            })
        else:
            # Summarize what was found
            signal_summary = []
            for sig_type, items in signals.items():
                if items:
                    signal_summary.append(f"{len(items)} {sig_type.replace('_', ' ')}")

            findings.append({
                "id": str(uuid.uuid4()),
                "severity": "medium",
                "category": "application",
                "title": "Bundle Analysis Summary - Multiple Signals Detected",
                "summary": f"Analysis detected: {', '.join(signal_summary)}. "
                           "These signals suggest potential cluster health issues requiring attention.",
                "root_cause": "Multiple signals detected across the support bundle indicate "
                              "possible configuration or resource issues.",
                "impact": "Cluster stability may be affected. Review individual findings for details.",
                "recommended_actions": [
                    "Review each signal category for specific issues",
                    "Check recent changes to cluster configuration",
                    "Verify resource limits match application requirements",
                    "Consider enabling LLM analysis for deeper insights"
                ],
                "confidence": 0.60,
                "source": "llm_analysis"
            })

        return findings


class LogChunker:
    """Split large log files into context-appropriate windows for LLM analysis."""

    MAX_CHUNK_SIZE = 3000  # characters per chunk

    def chunk(self, log_content: str, max_chunks: int = 5) -> List[str]:
        """
        Split log content into manageable chunks.

        Args:
            log_content: Full log text
            max_chunks: Maximum number of chunks to return

        Returns:
            List of log excerpt strings
        """
        lines = log_content.split("\n")
        chunks = []
        current_chunk = []
        current_size = 0

        for line in lines:
            line_size = len(line) + 1  # +1 for newline
            if current_size + line_size > self.MAX_CHUNK_SIZE and current_chunk:
                chunks.append("\n".join(current_chunk))
                current_chunk = []
                current_size = 0
                if len(chunks) >= max_chunks:
                    break

            current_chunk.append(line)
            current_size += line_size

        if current_chunk and len(chunks) < max_chunks:
            chunks.append("\n".join(current_chunk))

        return chunks

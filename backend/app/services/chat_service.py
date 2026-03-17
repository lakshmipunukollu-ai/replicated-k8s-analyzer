import anthropic
from app.config import settings


def _evidence_str(evidence) -> str:
    if not evidence:
        return ""
    if isinstance(evidence, list):
        parts = []
        for x in evidence[:5]:
            if isinstance(x, dict):
                parts.append(str(x.get("content") or x.get("source") or x))
            else:
                parts.append(str(x))
        return " ".join(parts)
    return str(evidence)


class BundleChatService:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    def answer(self, bundle, findings, question: str) -> str:
        findings_text = "\n".join([
            f"- [{f.severity}] {f.title}: {f.summary or ''} | Root cause: {f.root_cause or ''} | Evidence: {_evidence_str(f.evidence)}"
            for f in findings
        ])
        prompt = f"""You are an expert Kubernetes SRE analyzing a support bundle named '{bundle.filename}'.

The bundle has {len(findings)} findings:
{findings_text}

Answer this question about the bundle concisely and precisely, citing specific evidence from the findings above:

Question: {question}

Be direct. Reference specific finding titles and evidence. If the question cannot be answered from the bundle data, say so clearly."""

        message = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text

"""
Serviço RAG (Retrieval-Augmented Generation) para busca na base de conhecimento
"""
import logging
from typing import List, Dict, Optional
from sqlmodel import Session, select, or_, func, and_
from app.models import KnowledgeBaseEntry

logger = logging.getLogger(__name__)


def search_knowledge_base(
    session: Session,
    query: str,
    tenant_id: int,
    limit: int = 5
) -> List[Dict]:
    """
    Busca na base de conhecimento usando busca textual simples.
    Em produção, pode ser melhorado com embeddings e vector search.
    """
    query_lower = query.lower()
    
    # Buscar por título, conteúdo ou keywords
    entries = session.exec(
        select(KnowledgeBaseEntry).where(
            and_(
                KnowledgeBaseEntry.tenant_id == tenant_id,
                or_(
                    func.lower(KnowledgeBaseEntry.title).contains(query_lower),
                    func.lower(KnowledgeBaseEntry.content).contains(query_lower),
                    func.lower(KnowledgeBaseEntry.keywords).contains(query_lower) if KnowledgeBaseEntry.keywords else False
                )
            )
        ).limit(limit)
    ).all()
    
    # Converter para dict e calcular relevância simples
    results = []
    for entry in entries:
        score = 0
        title_lower = entry.title.lower()
        content_lower = entry.content.lower()
        keywords_lower = (entry.keywords or "").lower()
        
        # Calcular score baseado em matches
        if query_lower in title_lower:
            score += 3
        if query_lower in content_lower:
            score += 1
        if query_lower in keywords_lower:
            score += 2
        
        results.append({
            "id": entry.id,
            "title": entry.title,
            "content": entry.content,
            "category": entry.category,
            "score": score
        })
    
    # Ordenar por score
    results.sort(key=lambda x: x["score"], reverse=True)
    
    return results[:limit]


def get_relevant_context(
    session: Session,
    query: str,
    tenant_id: int,
    max_results: int = 3
) -> str:
    """
    Retorna contexto relevante formatado para o LLM
    """
    results = search_knowledge_base(session, query, tenant_id, limit=max_results)
    
    if not results:
        return "Nenhuma informação relevante encontrada na base de conhecimento."
    
    context_parts = []
    for i, result in enumerate(results, 1):
        context_parts.append(
            f"[{i}] {result['title']}\n"
            f"Categoria: {result['category']}\n"
            f"Descrição: {result['content']}\n"
        )
    
    return "\n---\n".join(context_parts)


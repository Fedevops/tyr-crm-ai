import json
from typing import Dict, Any, TypedDict
from langgraph.graph import StateGraph, END
from app.agents.llm_helper import get_llm
from app.config import settings

# Define the state for the agent
class AgentState(TypedDict):
    """State for the SDR agent"""
    lead_name: str
    lead_email: str
    lead_company: str
    lead_position: str
    research_data: Dict[str, Any]
    suggested_approach: str
    playbook_content: str


def research_lead(state: AgentState) -> AgentState:
    """Research the lead (simulated for now)"""
    # In production, this would call external APIs or tools
    # For now, we simulate research data
    state["research_data"] = {
        "company_size": "50-200 employees",
        "industry": "Technology",
        "recent_news": "Company recently raised Series A funding",
        "tech_stack": ["React", "Python", "PostgreSQL"],
        "pain_points": ["Scaling infrastructure", "Team collaboration"]
    }
    return state


def generate_approach(state: AgentState) -> AgentState:
    """Generate sales approach based on research and playbook"""
    llm = get_llm(temperature=0.7)
    
    if llm:
        prompt = f"""
        You are an expert SDR (Sales Development Representative). 
        
        Lead Information:
        - Name: {state['lead_name']}
        - Email: {state['lead_email']}
        - Company: {state['lead_company']}
        - Position: {state.get('lead_position', 'N/A')}
        
        Research Data:
        {json.dumps(state['research_data'], indent=2)}
        
        Playbook Guidelines:
        {state['playbook_content']}
        
        Based on the research data and playbook guidelines, suggest a personalized sales approach for this lead.
        Provide a clear, actionable strategy that includes:
        1. Opening message/angle
        2. Key value propositions to highlight
        3. Best time/way to reach out
        4. Potential objections and how to handle them
        
        Keep the response concise but comprehensive.
        """
        
        response = llm.invoke(prompt)
        state["suggested_approach"] = response.content
    else:
        # Fallback if no API key
        state["suggested_approach"] = f"""
        Suggested Approach for {state['lead_name']} at {state['lead_company']}:
        
        1. Opening: Reference their recent Series A funding and congratulate them
        2. Value Prop: Focus on how our solution helps with scaling infrastructure
        3. Timing: Reach out via LinkedIn first, then email follow-up
        4. Objections: Be prepared to discuss ROI and implementation timeline
        
        Note: LLM não configurado. Configure OpenAI ou Ollama no arquivo .env. Esta é uma resposta simulada.
        """
    
    return state


# Build the agent graph
def create_sdr_agent():
    """Create the SDR agent graph"""
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("research", research_lead)
    workflow.add_node("generate_approach", generate_approach)
    
    # Define the flow
    workflow.set_entry_point("research")
    workflow.add_edge("research", "generate_approach")
    workflow.add_edge("generate_approach", END)
    
    return workflow.compile()


async def process_lead_with_agent(
    lead_name: str,
    lead_email: str,
    lead_company: str,
    lead_position: str = None,
    playbook_content: str = ""
) -> Dict[str, Any]:
    """Process a lead through the SDR agent"""
    # Initialize state
    initial_state = {
        "lead_name": lead_name,
        "lead_email": lead_email,
        "lead_company": lead_company,
        "lead_position": lead_position or "",
        "research_data": {},
        "suggested_approach": "",
        "playbook_content": playbook_content
    }
    
    # Create and run agent
    agent = create_sdr_agent()
    result = agent.invoke(initial_state)
    
    return {
        "suggested_approach": result["suggested_approach"],
        "research_data": result["research_data"]
    }


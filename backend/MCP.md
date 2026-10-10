# Roundwise Personalized Practice MCP

The backend exposes an authenticated Streamable HTTP MCP endpoint at `http://localhost:5001/mcp` by default. Run the backend and Python AI service as usual before asking the MCP client to generate a question.

Every MCP request must include a valid Roundwise session JWT:

```http
Authorization: Bearer <roundwise-session-jwt>
```

The JWT determines which user's data the tools can access. The tools do not accept a user ID.

## Tools

- `get_user_performance`: returns completed-session average scores by topic and recurring weak-answer areas, grouped by the authenticated user's account.
- `generate_question`: generates a question for the weakest topic by default. Optional inputs are `topic`, `role`, `difficulty` (`Easy`, `Medium`, or `Hard`), and `focus_area`. If no focus area is supplied, the most frequently recurring weakness for that topic is used when available.

Generated questions include expected answer points. They are returned to the MCP client and are not saved as interview sessions; use the Roundwise interview flow to record answers and update performance history.

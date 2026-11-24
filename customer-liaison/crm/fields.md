# Zoho CRM Fields For The Client Liaison

Not created yet. They go on the Contacts module once Damian says yes. Only Damian sets them.

| Field label | API name | Type | Purpose |
|---|---|---|---|
| Agent Channel Approved | Agent_Channel_Approved | Checkbox | Damian's approval. Unticked means the agent never answers this contact. |
| Agent Scope Project ID | Agent_Scope_Project_ID | Single line | The one Zoho Projects project the agent may touch for this contact. |
| Agent Opt In At | Agent_Opt_In_At | Date/Time | When the customer replied YES to the welcome. Set by the agent. |
| Agent Paused | Agent_Paused | Checkbox | Set by the weekly audit on any finding. Damian unticks it after review. |
| Agent Time Zone | Agent_Time_Zone | Single line | The customer's time zone for client hours, for example America/Nassau. |
| Agent Prepaid Amount | Agent_Prepaid_Amount | Currency | What the customer has prepaid for the assistant service. |
| Books Customer ID | Books_Customer_ID | Single line | The matching Zoho Books contact, for the usage invoice draft. |

The WhatsApp number is the contact's Mobile field, in E.164 form (+ and digits).

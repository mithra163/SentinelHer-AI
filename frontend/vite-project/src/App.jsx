import { useState } from "react";
import axios from "axios";

function App() {

  const [msg, setMsg] = useState("");
  const [data, setData] = useState(null);

  const sendMessage = async () => {

    const res = await axios.get(
      `http://127.0.0.1:8000/chat?msg=${msg}`
    );

    setData(res.data);
  };

  return (

    <div className="p-10 bg-black min-h-screen text-white">

      <h1 className="text-4xl font-bold mb-10">
        SentinelHer AI
      </h1>

      <input
        className="p-3 text-black w-[400px]"
        value={msg}
        onChange={(e)=>setMsg(e.target.value)}
      />

      <button
        className="bg-blue-500 px-5 py-3 ml-5"
        onClick={sendMessage}
      >
        Send
      </button>

      {
        data && (

          <div className="mt-10">

            <div className="bg-gray-900 p-5 rounded">

              <h2 className="text-xl font-bold">
                AI Response
              </h2>

              <p>{data.response}</p>

            </div>

            <div className="bg-gray-900 p-5 rounded mt-5">

              <h2 className="text-xl font-bold">
                Runtime Routing
              </h2>

              <p>Model Used: {data.model_used}</p>

              <p>
                Emergency:
                {data.emergency ? " TRUE" : " FALSE"}
              </p>

            </div>

            <div className="bg-gray-900 p-5 rounded mt-5">

              <h2 className="text-xl font-bold">
                Memory
              </h2>

              <pre>
                {JSON.stringify(data.memory, null, 2)}
              </pre>

            </div>

            {
              data.incident_summary && (

                <div className="bg-red-700 p-5 rounded mt-5">

                  <h2 className="text-xl font-bold">
                    Emergency Summary
                  </h2>

                  <p>{data.incident_summary}</p>

                </div>
              )
            }

          </div>
        )
      }

    </div>
  );
}

export default App;
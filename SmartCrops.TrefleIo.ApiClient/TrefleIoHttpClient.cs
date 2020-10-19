using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;

namespace SmartCrops.TrefleIo.ApiClient
{
    public class TrefleIoHttpClient : HttpClient
    {
        public TrefleIoHttpClient()
        {
            BaseAddress = new Uri("https://trefle.io/api/v1/");
        }
    }
}

using Newtonsoft.Json;
using SmartCrops.TrefleIo.ApiClient;
using SmartCrops.TrefleIo.ApiClient.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace SmartCrops.Api.Jobs
{
    public class TrefleIoDataRetreiver
    {

        public async Task<Rootobject> GetPlants()
        {
            TrefleIoHttpClient client = new TrefleIoHttpClient();
            var result = await client.GetAsync("plants?token=7FB9lhTULk2NNzMqCwIuHV4EjseOmlytbQoSDiEvo3M");
            if (result.IsSuccessStatusCode)
            {
                var plants = JsonConvert.DeserializeObject<Rootobject>(await result.Content.ReadAsStringAsync());

                return plants;
            }

            return null;
        }
    }
}

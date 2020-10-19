using System;
using System.Collections.Generic;
using System.Text;

namespace SmartCrops.TrefleIo.ApiClient.Models
{

    public class Rootobject
    {
        public Datum[] data { get; set; }
        public Links links { get; set; }
        public Meta meta { get; set; }
    }

    public class Links
    {
        public string self { get; set; }
        public string first { get; set; }
        public string prev { get; set; }
        public string next { get; set; }
        public string last { get; set; }
    }

    public class Meta
    {
        public int total { get; set; }
    }

    public class Datum
    {
        public int id { get; set; }
        public string common_name { get; set; }
        public string slug { get; set; }
        public string scientific_name { get; set; }
        public int year { get; set; }
        public string bibliography { get; set; }
        public string author { get; set; }
        public string status { get; set; }
        public string rank { get; set; }
        public string family_common_name { get; set; }
        public int genus_id { get; set; }
        public string image_url { get; set; }
        public string[] synonyms { get; set; }
        public string genus { get; set; }
        public string family { get; set; }
        public Links1 links { get; set; }
    }

    public class Links1
    {
        public string self { get; set; }
        public string plant { get; set; }
        public string genus { get; set; }
    }

}

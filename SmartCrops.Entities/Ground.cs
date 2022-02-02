using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace SmartCrops.Entities
{
    public class Ground
    {
        [Key]
        public int Id { get; set; }
        public GroundType Type { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public Obstacle? Obstacles { get; set; }
        public Plant? Plants { get; set; }
    }
}
